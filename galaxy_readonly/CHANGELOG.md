# Changelog
## 0.7.0
- Zone names, types and groups from the panel (RSS export) built in: 64 zones.
- Group names (8 groups).
- Names are editable in the Web UI ("Имена" tab) and saved in /data/names.json, no app update needed.
- A sensor is created for every configured zone at startup (off = normal).
- Zone attributes: group, group_name, type, armed (true when its group is set).
## 0.6.0
- Zone alarm sensors, persistence, auto-clear.
## 0.5.0
- Payload decoding, group sensors.
## 0.4.x
- Receiver, ACK, CRC per length, HA token fix.
