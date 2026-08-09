Waiting-room music for ask_user questions (HumanInteraction Feature).

Drop audio files (mp3/ogg) into THIS folder and list their filenames in
manifest.json, e.g.:

    ["lobby1.mp3", "lobby2.mp3"]

While a question is waiting for an answer, the chat page picks ONE at random
and loops it (the in-page mute toggle wins). With an empty manifest the page
falls back to its built-in synthesized quiz-lobby loops.

Note: whatever you drop here is served to every visitor — only use audio you
have the rights to distribute.
