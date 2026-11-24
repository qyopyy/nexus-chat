-- More Phone Link actions: on-screen message, speak aloud, countdown timer, keep screen awake,
-- reload Nexus, refresh battery now, SOS vibration. Apply AFTER 20261112010000_phone_link_desk.sql.
alter table public.nexus_handset_commands drop constraint if exists nexus_handset_commands_kind_check;
alter table public.nexus_handset_commands
  add constraint nexus_handset_commands_kind_check
  check (kind in (
    'open_url', 'note', 'clipboard', 'clipboard_pull',
    'ring', 'vibrate', 'torch', 'find_stop',
    'play', 'pause', 'next', 'prev', 'volume', 'seek', 'sleep', 'crossfade', 'ping',
    'camera', 'voice', 'sign_out', 'screenshot', 'gallery',
    'message', 'speak', 'timer', 'wake_on', 'wake_off', 'reload', 'battery_now', 'sos'
  ));
