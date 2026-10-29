# Changelog
## 0.4.1
- Fix: read SUPERVISOR_TOKEN from the s6 container environment when it is missing from the process environment.
- Startup check logs "HA API: connected"; every HA call is logged (OK or error).
- sensor.galaxy_last_event is created at startup with state "waiting".
## 0.4.0
- Event Monitor compatible receiver for the E080 A.Monitor channel (UDP 10002).
- Session reply and per-event ACK, CRC-16/0x1021. No panel control.
