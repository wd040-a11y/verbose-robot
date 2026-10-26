"""Packaged GUI integration probe, explicitly invoked only by the build test harness."""
from pathlib import Path
import ctypes
import json
import os
import sys
import time
from PySide6.QtCore import QTimer,Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication,QMessageBox
from .gui import MainWindow
from .io import load_json,write_json

def main(config_path,report_path):
    config=load_json(Path(config_path)); report_path=Path(report_path)
    app=QApplication.instance() or QApplication(sys.argv);app.setQuitOnLastWindowClosed(False)
    failures=[]
    QMessageBox.warning=lambda *args:failures.append(str(args[-1]))
    QMessageBox.information=lambda *args:failures.append(str(args[-1]))
    result={'platform':sys.platform,'frozen':bool(getattr(sys,'frozen',False)), 'console_attached':bool(ctypes.windll.kernel32.GetConsoleWindow()) if os.name=='nt' else None,'cases':[],'success':False}
    try:
        for case in config['cases']:
            window=MainWindow();window.output.clear();window.show();app.processEvents()
            # Same folder-selection path as the normal directory picker, with automatic scan.
            window.folder.setText(case['input'])
            report_path.parent.mkdir(parents=True,exist_ok=True)
            def wait(predicate,timeout=90):
                deadline=time.monotonic()+timeout
                while not predicate():
                    app.processEvents();time.sleep(.01)
                    if failures: raise RuntimeError(str(failures)+window.log.toPlainText())
                    (report_path.parent/"last-state.txt").write_text(window.status.text()+"\n"+window.log.toPlainText(),encoding="utf-8")
                    if time.monotonic()>deadline: raise TimeoutError('GUI operation timed out')
            wait(lambda:window.thread is None and bool(window.candidates) and not window.scan_timer.isActive())
            assert window.start.isEnabled()
            assert window.candidates[0].engine==case['engine']
            QTest.mouseClick(window.start,Qt.LeftButton)
            wait(lambda:window.thread is None and window.last_output is not None)
            package=load_json(window.last_output/'report.json')['data']
            assert package['schema_valid'] and package['output_counts']['maps']>=1
            assert window.open.isEnabled()
            report_path.parent.mkdir(parents=True,exist_ok=True)
            image=report_path.parent/(case['engine']+'-gui.png'); assert window.grab().save(str(image))
            opened=window.open_output() if config.get('open_folder') else None
            if config.get('open_folder'): assert opened
            result['cases'].append({'engine':case['engine'],'report':package,'screenshot':str(image),'open_folder':opened,'progress':window.bar.value(),'button_enabled':True})
            window.close();app.processEvents()
            # Create a second real window to exercise close/reopen.
            reopened=MainWindow();reopened.show();app.processEvents();reopened.close();app.processEvents()
        assert result['console_attached'] is not True
        result['success']=True
    except Exception as exc:
        result['error']=type(exc).__name__+': '+str(exc)
    finally:
        write_json(report_path,result)
    return 0 if result['success'] else 1
