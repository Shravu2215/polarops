import os
import sys
import tempfile
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import Base, get_db
import database

@pytest.fixture(autouse=True)
def db_session(request):
    """
    Creates a fresh temporary SQLite database per test, overrides the app's get_db dependency,
    and updates database.engine & database.SessionLocal so direct imports use the test database.
    """
    db_file = os.path.join(os.path.dirname(__file__), "..", "test_polarops_temp.db")
    if os.path.exists(db_file):
        try:
            os.remove(db_file)
        except OSError:
            pass

    test_engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
        echo=False
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    orig_engine = database.engine
    orig_session_local = database.SessionLocal

    database.engine = test_engine
    database.SessionLocal = TestingSessionLocal

    Base.metadata.create_all(bind=test_engine)

    def _override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    yield TestingSessionLocal

    app.dependency_overrides.clear()
    database.engine = orig_engine
    database.SessionLocal = orig_session_local

    test_engine.dispose()
    if os.path.exists(db_file):
        try:
            os.remove(db_file)
        except OSError:
            pass
