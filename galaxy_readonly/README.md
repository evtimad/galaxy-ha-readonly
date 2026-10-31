# Galaxy 3-144 Gateway (v0.6.0)
Receives Galaxy E080 "Alarm Monitor" events in Home Assistant. Replies only with the session/ACK frames
that Event Monitor sends. Never sends commands, never arms/disarms, never programs the panel.

Entities: sensor.galaxy_last_event, sensor.galaxy_group_N, binary_sensor.galaxy_zone_N (on = alarm).
Event: galaxy_event (code, text, group, user, point, zone, panel_time).
Zone alarm clears only on the matching restore event: enable the ZONE RESTORAL trigger in A.Monitor.
