// Empties dist/ before a build, so files of moved or deleted modules don't linger there.
import { rmSync } from "node:fs";

rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
