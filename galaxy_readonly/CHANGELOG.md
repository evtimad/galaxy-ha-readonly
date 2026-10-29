# Changelog
## 0.4.2
- Fix: events of any length (e.g. 63-byte SETTING events) are accepted and acknowledged when the CRC is valid. Previously only 51-byte events were acknowledged, so the E080 kept retrying.
- Event frames with an invalid CRC are logged with full HEX and not acknowledged.
- Event length shown in the journal and sent to Home Assistant.
## 0.4.1
- SUPERVISOR_TOKEN fix and HA API logging.
## 0.4.0
- Event Monitor compatible receiver (session reply + ACK, CRC-16/0x1021).
