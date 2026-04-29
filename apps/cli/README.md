# pmem CLI

The `pmem` command-line application is published as the `project-memory-manager` npm package.

```bash
npm install -g project-memory-manager
pmem init
pmem check
pmem hooks install
```

The CLI delegates domain behavior to `@pmem/core` and keeps command parsing, terminal output, and MCP server wiring in this package.
