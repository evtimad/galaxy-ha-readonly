# Changelog
## 0.5.0
- Payload decoded (8-byte positional XOR). Fields: account, panel time, group (ri), user (id), point (pi), SIA code, text.
- sensor.galaxy_last_event state = event text (e.g. FULL SET, UNSET, REM CALL); galaxy_event carries code/group/user/point.
- sensor.galaxy_group_N = armed / disarmed / armed_partial from CL / OP / NL.
- Web UI shows decoded events and group states.
## 0.4.3
- Fix: 63-byte events use CRC start value 0x2912 (51-byte: 0x9E81). Both verified on captured frames.
- Unknown event lengths: CRC start value is learned from the first frame and stored in /data/crc_inits.json; later frames of that length must match it.
## 0.4.2
- Fix: events of any length (e.g. 63-byte SETTING events) are accepted and acknowledged when the CRC is valid. Previously only 51-byte events were acknowledged, so the E080 kept retrying.
- Event frames with an invalid CRC are logged with full HEX and not acknowledged.
- Event length shown in the journal and sent to Home Assistant.
## 0.4.1
- SUPERVISOR_TOKEN fix and HA API logging.
## 0.4.0
- Event Monitor compatible receiver (session reply + ACK, CRC-16/0x1021).
