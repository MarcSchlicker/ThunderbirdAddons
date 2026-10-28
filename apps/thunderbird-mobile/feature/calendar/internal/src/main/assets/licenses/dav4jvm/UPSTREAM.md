# dav4jvm source integration

Upstream: https://github.com/bitfireAT/dav4jvm
Version: 4.1.0
Commit: 2527df195af7e2765b4142e70ca0157068df1278
License: MPL-2.0; LICENSE, AUTHORS and per-file notices retained.

All imported Kotlin source files are unmodified and verified against their Git blob hashes.
The local build adapter compiles against TB-Connect Java 17 rather than upstream Java 21.
No DAVx5 app, Hilt dependency graph, UI, Google client identity or credentials are imported.
Android supplies XmlPullParser; JVM tests use XPP3. Do not run project autoformatters on upstream sources.

Archive SHA256: 8cc5ec4ccf9b13f9f0a0c451856bdb9b2fb2571e8f3872cc51c127a6a79913ab
