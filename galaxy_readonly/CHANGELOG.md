# Changelog
## 0.4.0
- Event Monitor compatible receiver for the E080 A.Monitor channel (UDP 10002).
- Session handshake reply (05 01 xx -> 50 01 xx) and per-event ACK, CRC-16/0x1021.
- CRC validation of every incoming frame; invalid or unknown frames are logged and never answered.
- Replies only to the configured E080 IP address.
- Duplicate suppression for retransmitted events.
- Fires `galaxy_event` and updates `sensor.galaxy_last_event` in Home Assistant.
- No panel control of any kind.
## 0.3.0
- Passive diagnostics.
