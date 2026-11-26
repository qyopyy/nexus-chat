// Feeds the chiaki-ng StreamOut patch the way a chiaki session does: a stream header (SPS/PPS),
// then one encoded H.264 frame per call at 60 fps from the video thread, and 10 ms Opus frames
// from another thread. Emulates the console's IDR answer by jumping to the next keyframe of
// the file when StreamOut asks for one.
//
//   streamout_test unit <h264 file> <hevc file>          offline checks, exits 0/1
//   streamout_test publish <rtsp url> <h264|hevc file> <seconds> [h264|hevc]
//       prints one JSON stats line per second on stdout, the last one when done.
//       Frames carry a 16-bit frame index like the console's, starting just before it wraps.
//       STREAM_OUT_TEST_JITTER=1 holds one frame a second back 120 ms, then sends the backlog
//       at once, like the console's Wi-Fi does.
#include "streamout.h"

#include <opus.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iterator>
#include <memory>
#include <string>
#include <thread>
#include <vector>

using Clock = std::chrono::steady_clock;
using Bytes = std::vector<uint8_t>;

static int failures = 0;
#define CHECK(cond) do { if(!(cond)) { std::printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #cond); failures++; } else std::printf("ok   %s\n", #cond); } while(0)

static std::atomic<bool> interrupted{false};

struct Nal { size_t start, end; }; // [start, end) including the start code

static std::vector<Nal> SplitNals(const Bytes &b)
{
	std::vector<Nal> nals;
	std::vector<size_t> starts;
	for(size_t i = 0; i + 3 <= b.size(); i++)
	{
		if(b[i] == 0 && b[i + 1] == 0 && b[i + 2] == 1)
		{
			starts.push_back(i > 0 && b[i - 1] == 0 ? i - 1 : i);
			i += 2;
		}
	}
	for(size_t k = 0; k < starts.size(); k++)
		nals.push_back({starts[k], k + 1 < starts.size() ? starts[k + 1] : b.size()});
	return nals;
}

static int NalType(const Bytes &b, const Nal &n, bool hevc)
{
	size_t p = n.start;
	while(b[p] == 0) p++;
	uint8_t h = b[p + 1];
	return hevc ? (h >> 1) & 0x3f : h & 0x1f;
}

/** Splits an Annex B file into a PS5-like stream header and one buffer per frame. */
struct Stream
{
	Bytes header;
	std::vector<Bytes> frames;
	std::vector<bool> key;
};

static Stream Load(const char *path, bool hevc)
{
	std::ifstream f(path, std::ios::binary);
	Bytes b((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
	Stream s;
	Bytes frame;
	bool frame_key = false;
	auto flush = [&] {
		if(frame.empty()) return;
		s.frames.push_back(frame);
		s.key.push_back(frame_key);
		frame.clear();
		frame_key = false;
	};
	for(const Nal &n : SplitNals(b))
	{
		int t = NalType(b, n, hevc);
		bool param = hevc ? (t >= 32 && t <= 34) : (t == 7 || t == 8);
		bool slice = hevc ? t < 32 : (t == 1 || t == 5);
		bool idr = hevc ? (t == 19 || t == 20) : t == 5;
		bool frame_start = hevc ? (b[n.start + (b[n.start + 2] == 1 ? 5 : 6)] & 0x80) : (b[n.start + (b[n.start + 2] == 1 ? 4 : 5)] & 0x80);
		if(param)
		{
			if(s.frames.empty() && frame.empty())
				s.header.insert(s.header.end(), b.begin() + (long)n.start, b.begin() + (long)n.end);
			continue;
		}
		if(!slice)
			continue; // AUD, SEI: the console does not send them
		if(frame_start)
			flush();
		frame.insert(frame.end(), b.begin() + (long)n.start, b.begin() + (long)n.end);
		frame_key = frame_key || idr;
	}
	flush();
	return s;
}

static void PrintStats(StreamOut &out, size_t idr_answers)
{
	StreamOut::Stats s = out.GetStats();
	std::printf("{\"video_in\":%llu,\"video_out\":%llu,\"video_skipped\":%llu,\"audio_out\":%llu,"
			"\"queue_dropped\":%llu,\"connects\":%llu,\"idr_requests\":%llu,\"idr_answers\":%zu,"
			"\"max_push_us\":%llu,\"video_resyncs\":%llu,\"audio_resyncs\":%llu,\"connected\":%s,\"refused\":%s}\n",
			(unsigned long long)s.video_in, (unsigned long long)s.video_out, (unsigned long long)s.video_skipped,
			(unsigned long long)s.audio_out, (unsigned long long)s.queue_dropped, (unsigned long long)s.connects,
			(unsigned long long)s.idr_requests, idr_answers, (unsigned long long)s.max_push_us,
			(unsigned long long)s.video_resyncs, (unsigned long long)s.audio_resyncs, out.IsConnected() ? "true" : "false", s.refused ? "true" : "false");
	std::fflush(stdout);
}

// ---------- FrameClock: timestamps by frame order ----------

static const int64_t FRAME_US_30 = 1000000 / 30;
static int64_t Slot30(int64_t i) { return i * 1000000 / 30; } // exact start of frame i at 30 fps
/** Pseudo-random delay in [0, range) µs for frame i. */
static int64_t Jitter(int64_t i, int64_t range) { return (int64_t)(((uint64_t)i * 2654435761u) >> 7) % range; }

/** pts deltas within [lo, hi] for frames [from, to) of a stamped sequence. */
static bool DeltasWithin(const std::vector<int64_t> &pts, size_t from, size_t to, int64_t lo, int64_t hi)
{
	for(size_t i = from + 1; i < to; i++)
		if(pts[i] - pts[i - 1] < lo || pts[i] - pts[i - 1] > hi)
		{
			std::printf("     delta %zu: %lld\n", i, (long long)(pts[i] - pts[i - 1]));
			return false;
		}
	return true;
}

static bool StrictlyIncreasing(const std::vector<int64_t> &pts)
{
	for(size_t i = 1; i < pts.size(); i++)
		if(pts[i] <= pts[i - 1])
			return false;
	return true;
}

static void TestFrameClock()
{
	// Wi-Fi jitter: 5-13 ms normally, every 10th frame 120 ms late. The timestamps stay 1/30 s apart.
	{
		FrameClock clock;
		std::vector<int64_t> pts, arrival;
		for(int64_t i = 0; i < 300; i++)
		{
			int64_t delay = i % 10 == 7 ? 120000 : 5000 + Jitter(i, 8000);
			arrival.push_back(1000000 + Slot30(i) + delay);
			pts.push_back(clock.Stamp(i, arrival.back()));
		}
		CHECK(DeltasWithin(pts, 0, pts.size(), FRAME_US_30 - 2500, FRAME_US_30 + 1100)); // vs 120 ms late
		bool never_ahead = true;
		for(size_t i = 0; i < pts.size(); i++)
			never_ahead = never_ahead && pts[i] <= arrival[i];
		CHECK(never_ahead);
		CHECK(clock.Resyncs() == 0);
	}

	// Lost frames leave a gap of their duration.
	{
		FrameClock clock;
		int64_t a = clock.Stamp(9, 1000000);
		int64_t b = clock.Stamp(15, 1000000 + Slot30(15) - Slot30(9) + 40000); // and arrived late
		CHECK(b - a == Slot30(15) - Slot30(9));
	}

	// The 16-bit frame index wraps around without a jump.
	{
		SeqUnwrapper16 unwrap;
		FrameClock clock;
		std::vector<int64_t> pts;
		for(int i = 0; i < 20; i++)
			pts.push_back(clock.Stamp(unwrap.Unwrap((uint16_t)(65530 + i)), 2000000 + Slot30(i)));
		CHECK(DeltasWithin(pts, 0, pts.size(), FRAME_US_30 - 1, FRAME_US_30 + 1));
		SeqUnwrapper16 u2;
		CHECK(u2.Unwrap(65535) == 65535 && u2.Unwrap(0) == 65536 && u2.Unwrap(2) == 65538);
	}

	// A restarted counter (new stream, reconnect) never sends timestamps back.
	{
		FrameClock clock;
		std::vector<int64_t> pts;
		for(int64_t i = 0; i < 30; i++)
			pts.push_back(clock.Stamp(1000 + i, 1000000 + Slot30(i)));
		for(int64_t i = 0; i < 30; i++)
			pts.push_back(clock.Stamp(i, 3000000 + Slot30(i)));
		pts.push_back(clock.Stamp(5, 4000000)); // and a repeated index
		pts.push_back(clock.Stamp(5, 4000000));
		CHECK(StrictlyIncreasing(pts));
		CHECK(pts[30] >= 3000000 - 300000); // the restart does not keep the old, early slots
	}

	// A long stall (the console stops sending, its counter does not advance): the clock
	// re-anchors, so the stall never turns into permanent delay.
	{
		FrameClock clock;
		int64_t worst = 0;
		for(int64_t i = 0; i < 400; i++)
		{
			int64_t arrival = 1000000 + Slot30(i) + (i >= 200 ? 2000000 : 0);
			worst = std::max(worst, arrival - clock.Stamp(i, arrival));
		}
		CHECK(worst <= 300000);
		CHECK(clock.Resyncs() == 1);
	}

	// A late burst under the bound keeps its slots: 250 ms late, then all at once.
	{
		FrameClock clock;
		std::vector<int64_t> pts;
		for(int64_t i = 0; i < 60; i++)
		{
			int64_t t = 1000000 + Slot30(i);
			if(i >= 30 && i < 38)
				t = 1000000 + Slot30(38); // frames 30-37 arrive together with frame 38
			pts.push_back(clock.Stamp(i, t));
		}
		CHECK(DeltasWithin(pts, 0, pts.size(), FRAME_US_30 - 1, FRAME_US_30 + 1));
		CHECK(clock.Resyncs() == 0);
	}

	// The console's clock runs 1% slow: two minutes of drift (1.2 s) are steered away smoothly,
	// with no re-anchoring and the delay kept small.
	{
		FrameClock clock;
		std::vector<int64_t> pts;
		int64_t worst = 0;
		for(int64_t i = 0; i < 3600; i++)
		{
			int64_t arrival = 1000000 + Slot30(i) * 101 / 100 + Jitter(i, 8000);
			pts.push_back(clock.Stamp(i, arrival));
			if(i > 300)
				worst = std::max(worst, arrival - pts.back());
		}
		CHECK(clock.Resyncs() == 0);
		CHECK(worst < 60000);
		CHECK(DeltasWithin(pts, 0, pts.size(), FRAME_US_30 - 1, FRAME_US_30 * 104 / 100));
	}

	// The console's clock runs 1% fast: timestamps never get ahead of the arrival clock.
	{
		FrameClock clock;
		bool never_ahead = true;
		std::vector<int64_t> pts;
		for(int64_t i = 0; i < 3600; i++)
		{
			int64_t arrival = 1000000 + Slot30(i) * 99 / 100 + Jitter(i, 8000);
			pts.push_back(clock.Stamp(i, arrival));
			never_ahead = never_ahead && pts.back() <= arrival;
		}
		CHECK(never_ahead);
		CHECK(clock.Resyncs() == 0);
		CHECK(StrictlyIncreasing(pts));
	}

	// Audio: 480 samples at 48 kHz are 10 ms apart whatever their arrival.
	{
		FrameClock::Config config;
		config.duration_num = 480 * 1000000LL;
		config.duration_den = 48000;
		FrameClock clock(config);
		std::vector<int64_t> pts;
		for(int64_t i = 0; i < 100; i++)
			pts.push_back(clock.Stamp(i, 1000000 + (i / 4) * 40000 + 3000)); // in bursts of four
		CHECK(DeltasWithin(pts, 8, pts.size(), 10000, 10000)); // after the first burst
	}
}

static int Unit(const char *h264_path, const char *hevc_path)
{
	TestFrameClock();

	Stream h264 = Load(h264_path, false);
	CHECK(!h264.frames.empty());
	CHECK(StreamOut::IsH264Header(h264.header.data(), h264.header.size()));
	CHECK(!StreamOut::HasH264Slice(h264.header.data(), h264.header.size()));
	CHECK(StreamOut::IsH264Keyframe(h264.frames[0].data(), h264.frames[0].size()));
	CHECK(StreamOut::HasH264Slice(h264.frames[1].data(), h264.frames[1].size()));
	CHECK(!StreamOut::IsH264Keyframe(h264.frames[1].data(), h264.frames[1].size()));

	Stream hevc = Load(hevc_path, true);
	CHECK(!hevc.frames.empty());
	CHECK(!StreamOut::IsH264Header(hevc.header.data(), hevc.header.size()));
	for(const Bytes &f : hevc.frames)
		if(StreamOut::HasH264Slice(f.data(), f.size())) { CHECK(!"HEVC frame read as H.264"); break; }

	// HEVC negotiated by the session: refused up front, nothing ever connects.
	StreamOut::Options options;
	options.url = "rtsp://127.0.0.1:1/unused";
	options.codec = CHIAKI_CODEC_H265;
	{
		StreamOut out(options, nullptr, nullptr);
		out.PushVideo(hevc.header.data(), hevc.header.size(), 0, false);
		CHECK(out.GetStats().refused);
		CHECK(out.GetStats().connects == 0);
	}
	// H.264 negotiated but HEVC arrives: refused on the first sample.
	options.codec = CHIAKI_CODEC_H264;
	{
		StreamOut out(options, nullptr, nullptr);
		out.PushVideo(hevc.header.data(), hevc.header.size(), 0, false);
		out.PushVideo(hevc.frames[0].data(), hevc.frames[0].size(), 0, false);
		CHECK(out.GetStats().refused);
		CHECK(out.GetStats().video_in == 0);
	}
	// Nothing listening: pushes stay instant and the destructor returns promptly.
	{
		StreamOut out(options, nullptr, nullptr);
		out.SetAudioHeader(2, 48000, 480);
		out.PushVideo(h264.header.data(), h264.header.size(), 0, false);
		for(int i = 0; i < 120; i++)
			out.PushVideo(h264.frames[(size_t)i % h264.frames.size()].data(), h264.frames[(size_t)i % h264.frames.size()].size(), 0, false);
		CHECK(!out.IsConnected());
		CHECK(out.GetStats().max_push_us < 5000);
	}
	std::printf("%s\n", failures ? "FAILED" : "PASSED");
	return failures ? 1 : 0;
}

static int Publish(const char *url, const char *path, int seconds, bool hevc)
{
	Stream stream = Load(path, hevc);
	if(stream.frames.empty()) { std::fprintf(stderr, "no frames in %s\n", path); return 1; }

	std::atomic<bool> idr_wanted{false};
	std::atomic<size_t> idr_answers{0};
	StreamOut::Options options;
	options.url = url;
	options.codec = hevc ? CHIAKI_CODEC_H265 : CHIAKI_CODEC_H264;
	options.width = 1280;
	options.height = 720;
	options.fps = 60;
	const char *jitter_env = getenv("STREAM_OUT_TEST_JITTER");
	bool jitter = jitter_env && *jitter_env == '1';
	if(const char *ms = getenv("CHIAKI_STREAM_OUT_IDR_MS"))
		options.idr_interval_ms = atoi(ms);
	auto owner = std::make_unique<StreamOut>(options, nullptr, [&] { idr_wanted = true; });
	StreamOut &out = *owner;

	std::atomic<bool> running{true};
	std::thread audio([&] {
		int err;
		OpusEncoder *enc = opus_encoder_create(48000, 2, OPUS_APPLICATION_AUDIO, &err);
		out.SetAudioHeader(2, 48000, 480);
		int16_t pcm[480 * 2];
		uint8_t packet[1500];
		double phase = 0;
		auto next = Clock::now();
		while(running)
		{
			for(int i = 0; i < 480; i++)
			{
				int16_t v = (int16_t)(8000 * std::sin(phase));
				phase += 2 * M_PI * 440 / 48000;
				pcm[2 * i] = pcm[2 * i + 1] = v;
			}
			int n = opus_encode(enc, pcm, 480, packet, sizeof(packet));
			if(n > 0)
				out.PushAudio(packet, (size_t)n);
			next += std::chrono::milliseconds(10);
			std::this_thread::sleep_until(next);
		}
		opus_encoder_destroy(enc);
	});

	out.PushVideo(stream.header.data(), stream.header.size(), 0, false);
	auto start = Clock::now();
	auto next = start;
	auto next_report = start + std::chrono::seconds(1);
	size_t i = 0;
	uint16_t frame_index = 65200; // wraps after 5.6 s
	while(!interrupted && Clock::now() - start < std::chrono::seconds(seconds))
	{
		if(idr_wanted.exchange(false))
		{
			// The console answers an IDR request with a keyframe: skip ahead to the next one.
			size_t j = (i + 1) % stream.frames.size();
			while(!stream.key[j]) j = (j + 1) % stream.frames.size();
			i = j;
			idr_answers++;
		}
		const Bytes &f = stream.frames[i];
		if(jitter && frame_index % 60 == 30)
			std::this_thread::sleep_for(std::chrono::milliseconds(120)); // then catch up below
		out.PushVideo(const_cast<uint8_t *>(f.data()), f.size(), 0, false, frame_index++);
		i = (i + 1) % stream.frames.size();
		next += std::chrono::microseconds(16667);
		std::this_thread::sleep_until(next);
		if(Clock::now() >= next_report)
		{
			PrintStats(out, idr_answers);
			next_report += std::chrono::seconds(1);
		}
	}
	running = false;
	audio.join();
	auto stopping = Clock::now();
	PrintStats(out, idr_answers);
	owner.reset();
	std::printf("{\"shutdown_ms\":%lld}\n",
			(long long)std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - stopping).count());
	return 0;
}

int main(int argc, char **argv)
{
	std::signal(SIGTERM, [](int) { interrupted = true; });
	std::signal(SIGINT, [](int) { interrupted = true; });
	if(argc == 4 && !strcmp(argv[1], "unit"))
		return Unit(argv[2], argv[3]);
	if(argc >= 5 && !strcmp(argv[1], "publish"))
		return Publish(argv[2], argv[3], atoi(argv[4]), argc > 5 && !strcmp(argv[5], "hevc"));
	std::fprintf(stderr, "usage: streamout_test unit <h264> <hevc> | publish <url> <file> <seconds> [h264|hevc]\n");
	return 2;
}
