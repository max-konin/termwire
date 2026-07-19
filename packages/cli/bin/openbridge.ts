#!/usr/bin/env bun
import { run } from "../src/index";

process.exitCode = await run(Bun.argv.slice(2));
