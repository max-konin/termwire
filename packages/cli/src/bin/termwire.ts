#!/usr/bin/env bun
import { run } from "../index";

process.exitCode = await run(Bun.argv.slice(2));
