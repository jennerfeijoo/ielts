# Reading grouping support (Questions 1–5, 6–13, etc.)

This patch enables "group mode" rendering in Reading: when the current question has `groupId`,
the UI renders ALL questions that share that `groupId` together, plus a shared options box if provided.

## Files
- js/ui.js
- js/runner_common.js

## How to use in data/reading/test2.json (example)
Inside a reading section (e.g., Passage 1), add a `groups` array with metadata, and set `groupId`
on each question.

Example:

"groups": [
  {
    "id": "R1-G1-5",
    "title": "Questions 1–5",
    "instructions": "Complete the notes below. Choose ONE WORD ONLY from the passage for each answer.",
    "optionsBox": null
  },
  {
    "id": "R1-G6-13",
    "title": "Questions 6–13",
    "instructions": "Do the following statements agree with the information in the passage? (TRUE/FALSE/NOT GIVEN)"
  }
],
"questions": [
  { "key":"1", "shortLabel":"1", "type":"text", "hint":"ONE WORD ONLY", "prompt":"...", "groupId":"R1-G1-5" },
  ...
  { "key":"5", "shortLabel":"5", "type":"text", "hint":"ONE WORD ONLY", "prompt":"...", "groupId":"R1-G1-5" },

  { "key":"6", "type":"tfng", "prompt":"...", "groupId":"R1-G6-13" },
  ...
]

## Shared word list / options (like 37–40 A–G)
Put the list on the group's `optionsBox` (or `sharedOptionsBox`), e.g.

"optionsBox": {
  "title": "A–G",
  "items": [
    { "letter":"A", "text":"invention" },
    { "letter":"B", "text":"goals" },
    ...
  ]
}

Then set groupId on Q37–40 to that group id.

