import os
os.environ.setdefault("QT_QPA_PLATFORM","offscreen")
import time
import pytest
pytest.importorskip("PySide6")
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from rpgextractor.gui import MainWindow
from rpgextractor.io import load_json
from tools.sample_factory import create_game

def wait_idle(window,timeout=30):
    until=time.monotonic()+timeout
    while window.thread is not None and time.monotonic()<until:
        QApplication.processEvents(); time.sleep(.01)
    assert window.thread is None,"GUI worker did not stop"

def test_gui_scan_extract_and_repeat_scan(tmp_path):
    app=QApplication.instance() or QApplication([])
    root,_=create_game(tmp_path/"game","MZ"); out=tmp_path/"export"
    w=MainWindow(); w.folder.setText(str(root)); w.output.setText(str(out)); w.show()
    try:
        w.start_scan(); wait_idle(w)
        assert len(w.candidates)==1 and w.start.isEnabled()
        assert "MZ" in w.evidence.text()
        w.start_extract(); wait_idle(w)
        assert w.open.isEnabled() and w.last_output.parent==out
        assert load_json(w.last_output/"report.json")["data"]["schema_valid"]
        assert "맵 2" in w.status.text()
        w.start_scan(); wait_idle(w)
        assert w.start.isEnabled()
    finally: w.close(); app.processEvents()
