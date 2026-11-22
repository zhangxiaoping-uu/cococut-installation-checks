# CocoCut installation checks

Synthetic acceptance tests for the public CocoCut Windows installer. This repository does not contain the product implementation or server code. Small release identity / branding contracts accompany the test harness.

The workflow runs only through manual dispatch on a clean, standard Windows runner. It verifies immutable public candidate downloads by SHA256, performs fresh and overwrite installations, checks native helpers and local media processing, and uses isolated fixture profiles. It does not log into real accounts, call paid models, create payments, or include API keys or user projects. Results are verification evidence only; running this workflow does not change the official download feed.

The fixtures and test scripts originate from the product commit recorded in `source-manifest.json`. The installer and payload identities are pinned in `candidate.json`.
