from __future__ import annotations

import asyncio

from app.migrations import main

if __name__ == "__main__":
    asyncio.run(main())
