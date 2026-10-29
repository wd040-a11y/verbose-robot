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
        assert not w.checks["raw_json"].isChecked() and not w.checks["llm"].isChecked()
        w.start_extract(); wait_idle(w)
        assert w.open.isEnabled() and w.last_output.parent==out
        assert load_json(w.last_output/"report.json")["data"]["schema_valid"]
        assert "맵 2" in w.status.text()
        assert (w.last_output/"Game.zip").is_file()
        assert "출력 검증" in w.log.toPlainText()
        w.start_scan(); wait_idle(w)
        assert w.start.isEnabled()
    finally: w.close(); app.processEvents()



def test_gui_resource_retry(tmp_path,monkeypatch):
    from PySide6.QtWidgets import QMessageBox
    from tools.sample_factory import write,KEY
    app=QApplication.instance() or QApplication([])
    errors=[];monkeypatch.setattr(QMessageBox,'warning',lambda *args:errors.append(args[-1]))
    root,_=create_game(tmp_path/'game','MZ');system=load_json(root/'data/System.json');system.pop('encryptionKey');write(root/'data/System.json',system)
    w=MainWindow();w.folder.setText(str(root));w.output.setText(str(tmp_path/'out'));w.show()
    try:
        w.start_scan();wait_idle(w);w.start_extract();wait_idle(w)
        original=w.last_output;assert w.retry.isEnabled()
        system['encryptionKey']=KEY;write(root/'data/System.json',system)
        w.launch('retry');wait_idle(w)
        assert not errors and w.last_output==original and w.open.isEnabled()
        assert (w.last_retry/'ResourcesRetry.zip').is_file()
    finally:w.close();app.processEvents()
