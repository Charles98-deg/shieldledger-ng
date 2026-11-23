from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from fastapi import Request

from app import db


@contextmanager
def write(request: Request) -> Iterator[sqlite3.Connection]:
    with db.session(request.app.state.db_path) as conn:
        yield conn


@contextmanager
def read(request: Request) -> Iterator[sqlite3.Connection]:
    conn = db.connect(request.app.state.db_path)
    try:
        yield conn
    finally:
        conn.close()


def today(request: Request):
    return request.app.state.clock.today()
