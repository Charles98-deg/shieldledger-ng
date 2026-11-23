"""python -m app.cli seed | reset-demo"""
from __future__ import annotations

import json
import sys

from app import audit, db
from app.config import SEED_DIR, Clock, get_settings
from app.repo import master


class _State:
    def __init__(self) -> None:
        s = get_settings()
        self.settings = s
        self.db_path = s.db_path
        self.clock = Clock()
        self.gemini = None


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "help"
    st = _State()
    if cmd == "seed":
        db.migrate(st.db_path)
        with db.session(st.db_path) as conn:
            counts = master.seed_all(conn, SEED_DIR)
            audit.append(conn, "SEEDED", "system", "seed", counts, actor="cli")
        print(json.dumps({"db": st.db_path, "seeded": counts}))
        return 0
    if cmd == "reset-demo":
        from app.api.meta import reset_demo
        print(json.dumps(reset_demo(st, ingest_pack=True)))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
