// Black-box test of the chiaki-ng NetInput patch: real UDP datagrams on localhost.
#include "netinput.h"
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QUdpSocket>
#include <QHostAddress>
#include <cstdio>

static int failures = 0;
#define CHECK(cond) do { if(!(cond)) { std::printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #cond); failures++; } else std::printf("ok   %s\n", #cond); } while(0)

static void pump(int ms) {
	QElapsedTimer t; t.start();
	while(t.elapsed() < ms) QCoreApplication::processEvents(QEventLoop::AllEvents, 5);
}

int main(int argc, char **argv) {
	qputenv("CHIAKI_NET_INPUT_PORT", "9471");
	QCoreApplication app(argc, argv);
	NetInput input;
	int changes = 0;
	int keyframes = 0;
	QObject::connect(&input, &NetInput::StateChanged, [&] { changes++; });
	QObject::connect(&input, &NetInput::KeyframeRequested, [&] { keyframes++; });
	CHECK(input.IsEnabled());

	QUdpSocket sender;
	auto send = [&](const char *json) { sender.writeDatagram(QByteArray(json), QHostAddress::LocalHost, 9471); pump(50); };

	send(R"({"v":1,"buttons":1,"l2":0,"r2":128,"lx":32767,"ly":-32767,"rx":0,"ry":0})");
	ChiakiControllerState s = input.GetState();
	CHECK(s.buttons == CHIAKI_CONTROLLER_BUTTON_CROSS);
	CHECK(s.r2_state == 128);
	CHECK(s.left_x == 32767 && s.left_y == -32767);
	CHECK(changes == 1);

	send(R"({"v":1,"buttons":1,"l2":0,"r2":128,"lx":32767,"ly":-32767,"rx":0,"ry":0})");
	CHECK(changes == 1); // same state again: no extra feedback

	// Keyframe requests ask the console for a keyframe and never touch the controller state.
	send(R"({"request":"keyframe"})");
	CHECK(keyframes == 1);
	CHECK(changes == 1);
	CHECK(input.GetState().buttons == CHIAKI_CONTROLLER_BUTTON_CROSS);
	send(R"({"request":"keyframe"})"); // too soon after the last one: dropped
	CHECK(keyframes == 1);
	send(R"({"request":"other"})");
	CHECK(keyframes == 1);
	CHECK(input.GetState().buttons == CHIAKI_CONTROLLER_BUTTON_CROSS);

	send("not json");
	send(R"({"v":2,"buttons":2})");
	CHECK(input.GetState().buttons == CHIAKI_CONTROLLER_BUTTON_CROSS); // garbage ignored

	send(R"({"v":1,"buttons":4294967295,"l2":999,"r2":-5,"lx":99999,"ly":-99999})");
	s = input.GetState();
	// Analog L2/R2 bits never leak through the mask; PS and Create (Share) are always cleared.
	CHECK(s.buttons == (0xFFFF & ~(CHIAKI_CONTROLLER_BUTTON_PS | CHIAKI_CONTROLLER_BUTTON_SHARE)));
	CHECK(s.l2_state == 255 && s.r2_state == 0);
	CHECK(s.left_x == 32767 && s.left_y == -32767);

	send(R"({"v":1,"buttons":32769})"); // PS + Cross
	CHECK(input.GetState().buttons == CHIAKI_CONTROLLER_BUTTON_CROSS);
	send(R"({"v":1,"buttons":8192})"); // Create (Share) alone
	CHECK(input.GetState().buttons == 0);

	pump(NetInput::NET_INPUT_KEYFRAME_MIN_MS);
	send(R"({"request":"keyframe"})");
	CHECK(keyframes == 2);

	pump(NetInput::NET_INPUT_TIMEOUT_MS + 150); // sender went silent
	s = input.GetState();
	CHECK(s.buttons == 0 && s.l2_state == 0 && s.left_x == 0);

	qputenv("CHIAKI_NET_INPUT_PORT", "");
	qunsetenv("CHIAKI_NET_INPUT_PORT");
	NetInput disabled;
	CHECK(!disabled.IsEnabled());

	std::printf(failures ? "FAILED (%d)\n" : "ALL PASSED\n", failures);
	return failures ? 1 : 0;
}
