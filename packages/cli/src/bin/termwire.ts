#!/usr/bin/env node
import { createNodeRuntime, run } from "../index.js";

process.exitCode = await run(process.argv.slice(2), createNodeRuntime());
