# Galaxy 3-144 Gateway (v0.4.1)
Receives Galaxy E080 "Alarm Monitor" events in Home Assistant. Replies only with the session/ACK
frames Event Monitor sends. Never sends commands, never arms/disarms, never programs the panel.
Panel: A.Monitor IP = Home Assistant IP, Port 10002, Account 000001.
Home Assistant: event `galaxy_event`, entity `sensor.galaxy_last_event`.
