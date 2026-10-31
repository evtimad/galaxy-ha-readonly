# Changelog
## 0.6.0
- Zone sensors: binary_sensor.galaxy_zone_<zone> from alarm/restore events (BA/BR, TA/TR, FA/FR, PA/PR, HA/HR, KA/KR, UA/UR, MA/MR).
- Omit (BB/BU) shown as attribute `omitted`.
- Zone names via option `zone_names` (e.g. `1001=Front door`).
- Zone and group states are stored in /data and re-published at startup and every 5 minutes (survive HA restarts).
- Optional auto-clear of zone alarms (`zone_auto_clear_minutes`, 0 = off).
- Web UI: zone and group cards.
## 0.5.0
- Payload decoding, group sensors.
## 0.4.x
- Receiver, ACK, CRC per length, HA token fix.
