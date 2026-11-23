# External data

`build_seconds.f32`: wall-clock build time of each module in seconds, one little-endian
32-bit float per module, in the order of the module paths sorted as strings.
Derived from `data/events.bin` (end time minus start time) in
https://github.com/patunz/rh-build-live, an independent rebuild by Lucio Patone,
snapshot of 22 November 2026. Many modules were compiled in parallel on one machine,
so a module's time depends on what else was running.
