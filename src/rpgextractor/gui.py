from __future__ import annotations
import sys
import zipfile
import os
import threading
from pathlib import Path
from PySide6.QtCore import Qt, QObject, QThread, Signal, QUrl, QTimer, QSettings
from PySide6.QtGui import QDesktopServices, QFont
from PySide6.QtWidgets import (QApplication,QMainWindow,QWidget,QVBoxLayout,QHBoxLayout,QLabel,QLineEdit,QPushButton,
                               QFileDialog,QComboBox,QCheckBox,QGroupBox,QGridLayout,QProgressBar,QPlainTextEdit,QMessageBox)
from .discovery import discover
from .pipeline import Extractor, Options
from .io import Cancelled, load_json
from .packaging import story_package

class Worker(QObject):
    progress=Signal(str,int,int,int)
    finished=Signal(object)
    failed=Signal(str)
    def __init__(self, action, folder, output, candidate, options, stop):
        super().__init__(); self.action=action; self.folder=folder; self.output=output
        self.candidate=candidate; self.options=options; self.stop=stop
    def run(self):
        try:
            def cancel():
                if self.stop.is_set(): raise Cancelled("작업을 취소했습니다.")
            if self.action=="scan":
                result=discover(self.folder,(),cancel)
            else:
                result=Extractor(self.options,self.progress.emit,self.stop.is_set).run(self.folder,self.output,self.candidate)
                if result["output_counts"]["maps"] and result["output_counts"]["events"]:
                    try:
                        self.progress.emit("경량 Story.zip 생성",0,1,0)
                        story_package(result["output_folder"],cancel)
                    except (OSError,Cancelled,zipfile.BadZipFile) as exc:
                        result["package_warning"]="Story.zip 생성 실패: "+str(exc)+". 추출 폴더는 보존됩니다."
            self.finished.emit(result)
        except Exception as exc:
            self.failed.emit(str(exc))

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__(); self.setWindowTitle("RPG Maker Extractor · MV / MZ / VX Ace"); self.resize(880,760)
        self.setAcceptDrops(True)
        self.settings=QSettings("RPGMakerExtractor","RPGMakerExtractor")
        self.scan_timer=QTimer(self); self.scan_timer.setSingleShot(True); self.scan_timer.timeout.connect(self.start_scan)
        self.candidates=[]; self.thread=None; self.stop=threading.Event(); self.last_output=None; self.last_stage=""
        content=QWidget(); self.setCentralWidget(content); layout=QVBoxLayout(content); layout.setSpacing(12)
        title=QLabel("RPG Maker 게임 데이터 추출"); title.setStyleSheet("font-size: 23px; font-weight: 700; color: #173f67;")
        layout.addWidget(title); layout.addWidget(QLabel("게임 실행 없이 이벤트·조건·리소스를 분석하여 별도 폴더에 저장합니다."))
        self.folder=QLineEdit(); self.output=QLineEdit()
        self.folder.setPlaceholderText("Game.exe가 있는 폴더 또는 프로젝트 폴더")
        self.output.setPlaceholderText("자동 설정 (선택하면 해당 위치에 새 결과 폴더 생성)")
        self.browse_input=QPushButton("게임 폴더 선택"); self.browse_output=QPushButton("출력 위치 선택")
        for field,button in ((self.folder,self.browse_input),(self.output,self.browse_output)):
            row=QHBoxLayout(); row.addWidget(field,1); row.addWidget(button); layout.addLayout(row)
        self.browse_input.clicked.connect(self.choose_input); self.browse_output.clicked.connect(self.choose_output)
        self.folder.textChanged.connect(self.invalidate_candidates)
        self.output.setText(self.settings.value("output_base",""))
        row=QHBoxLayout(); self.scan=QPushButton("다시 분석"); self.roots=QComboBox(); row.addWidget(self.scan); row.addWidget(self.roots,1); layout.addLayout(row)
        self.scan.clicked.connect(self.start_scan); self.roots.currentIndexChanged.connect(self.show_candidate)
        self.evidence=QLabel("게임 폴더를 선택하거나 이 창에 끌어 놓으세요. 자동으로 분석합니다."); self.evidence.setWordWrap(True); layout.addWidget(self.evidence)
        group=QGroupBox("고급 설정"); group.setVisible(False);
        advanced=QCheckBox("고급 설정 표시"); layout.addWidget(advanced); advanced.toggled.connect(group.setVisible)
        grid=QGridLayout(group); self.checks={}
        labels=[("raw_json","원본 JSON 보존",True,"System.json의 암호화 키는 기본적으로 제외합니다."),
                ("plugin_sources","JavaScript·플러그인 원본 보존",True,"파일을 자료로 복사하며 실행하지 않습니다."),
                ("images","이미지·효과 추출",True,"이미지 참조는 이 옵션을 꺼도 색인화합니다."),
                ("decrypt","표준 암호화 파일 복원",True,"System.json에 있는 표준 키와 검증된 헤더만 사용합니다."),
                ("audio","오디오 포함",False,"용량이 클 수 있습니다. 꺼도 참조 관계를 기록합니다."),
                ("movies","영상 포함",False,"영상 파일을 결과에 복사합니다."),
                ("llm","LLM 분석용 자료 생성",True,"로컬 JSON/JSONL만 생성합니다. 외부 업로드 없음."),
                ("detailed_reports","상세 오류 보고서",True,"상세 로그 출력 옵션. 필수 오류·검증 보고서는 항상 저장합니다."),
                ("keep_tiles","타일 배열 보존",True,"후속 도구가 맵을 표시할 때 사용하는 원본 타일 배열입니다."),
                ("sensitive_system","키 포함 System.json 원본 보관",False,"선택하면 source_archive에 암호화 키가 포함됩니다. 개인 보관용.")]
        for i,(key,label,checked,tip) in enumerate(labels):
            box=QCheckBox(label); box.setChecked(checked); box.setToolTip(tip); self.checks[key]=box; grid.addWidget(box,i//2,i%2)
        layout.addWidget(group)
        idrow=QHBoxLayout(); idrow.addWidget(QLabel("게임 식별자 (선택)")); self.game_id=QLineEdit(); self.game_id.setPlaceholderText("비워 두면 자동 생성 · 영문/숫자/._-"); idrow.addWidget(self.game_id); grid.addLayout(idrow,6,0,1,2)
        row=QHBoxLayout(); self.start=QPushButton("추출 시작"); self.start.setStyleSheet("font-weight: bold; padding: 10px; background: #d9ebff;")
        self.start.setEnabled(False); self.cancel_button=QPushButton("취소"); self.cancel_button.setEnabled(False); self.open=QPushButton("결과 폴더 열기"); self.open.setEnabled(False)
        row.addWidget(self.start,2); row.addWidget(self.cancel_button); row.addWidget(self.open); layout.addLayout(row)
        self.start.clicked.connect(self.start_extract); self.cancel_button.clicked.connect(self.stop.set); self.open.clicked.connect(self.open_output)
        self.bar=QProgressBar(); self.bar.setValue(0); layout.addWidget(self.bar)
        self.status=QLabel("대기 중"); self.status.setWordWrap(True); layout.addWidget(self.status)
        self.log=QPlainTextEdit(); self.log.setReadOnly(True); self.log.document().setMaximumBlockCount(1500); layout.addWidget(self.log,1)
    def dragEnterEvent(self,event):
        if not self.thread and event.mimeData().hasUrls() and any(u.isLocalFile() for u in event.mimeData().urls()): event.acceptProposedAction()
    def dropEvent(self,event):
        if self.thread: return
        urls=[u for u in event.mimeData().urls() if u.isLocalFile()]
        if urls: self.folder.setText(urls[0].toLocalFile()); event.acceptProposedAction()
    def invalidate_candidates(self):
        if self.thread: return
        self.candidates=[]; self.roots.clear(); self.start.setEnabled(False)
        if self.folder.text().strip(): self.scan_timer.start(400)
    def choose_input(self):
        value=QFileDialog.getExistingDirectory(self,"게임 폴더 선택")
        if value:
            self.folder.setText(value)

    def choose_output(self):
        value=QFileDialog.getExistingDirectory(self,"결과 폴더를 생성할 위치 선택")
        if value:
            self.output.setText(value); self.settings.setValue("output_base",value)
    def show_candidate(self,index):
        if 0<=index<len(self.candidates):
            c=self.candidates[index]; self.evidence.setText(f"{c.engine} / 신뢰도 {dict(high='높음',low='낮음').get(c.confidence,c.confidence)} / 맵 파일 {c.map_files}개 / 파일 {c.file_count}개\n"+"\n".join(c.evidence))
            self.start.setEnabled(not self.thread)
    def launch(self,action):
        if self.thread: return
        if not self.folder.text().strip(): QMessageBox.information(self,"폴더 필요","게임 폴더를 선택하세요."); return
        self.scan_timer.stop()
        if action=="extract" and not self.candidates: return
        self.stop.clear(); self.last_stage=""; self.open.setEnabled(False)
        options=Options(**{k:v.isChecked() for k,v in self.checks.items()},game_id=self.game_id.text().strip() or None)
        candidate=self.candidates[self.roots.currentIndex()] if action=="extract" else None
        self.active_action=action; self.thread=QThread(self)
        self.worker=Worker(action,Path(self.folder.text()),Path(self.output.text()).absolute() if self.output.text() else None,candidate,options,self.stop)
        self.worker.moveToThread(self.thread); self.thread.started.connect(self.worker.run)
        self.worker.progress.connect(self.on_progress); self.worker.finished.connect(self.on_result); self.worker.failed.connect(self.on_error)
        self.worker.finished.connect(self.thread.quit); self.worker.failed.connect(self.thread.quit)
        self.thread.finished.connect(self.worker.deleteLater); self.thread.finished.connect(self.on_thread_finished)
        self.set_busy(True); self.bar.setRange(0,0); self.status.setText("분석 중…" if action=="scan" else "추출 준비 중…"); self.thread.start()
    def set_busy(self,busy):
        for control in [self.folder,self.output,self.browse_input,self.browse_output,self.scan,self.roots,self.game_id,*self.checks.values()]: control.setEnabled(not busy)
        self.start.setEnabled(not busy and bool(self.candidates)); self.cancel_button.setEnabled(busy)
    def start_scan(self): self.launch("scan")
    def start_extract(self): self.launch("extract")
    def on_progress(self,stage,current,total,errors):
        self.bar.setRange(0,1000); self.bar.setValue(int(current/max(1,total)*1000))
        self.status.setText(f"{stage} · {current:,}/{total:,} · 오류 {errors:,}개")
        if stage!=self.last_stage: self.log.appendPlainText(stage); self.last_stage=stage
    def on_result(self,result):
        if self.active_action=="scan":
            self.candidates=result; self.roots.clear()
            for c in result: self.roots.addItem(f"{c.engine} · {c.root}")
            self.status.setText(f"데이터 루트 {len(result)}개 발견. 여러 개이면 목록에서 선택하세요." if result else "지원 데이터 루트를 찾지 못했습니다. data 폴더/엔진 파일을 확인하세요.")
            self.bar.setRange(0,100); self.bar.setValue(100)
        else:
            if result.get("package_warning"): self.log.appendPlainText(result["package_warning"])
            self.last_output=Path(result["output_folder"]); self.open.setEnabled(True)
            counts=result["output_counts"]; state={"complete":"완료","complete_with_issues":"완료 (경고 확인)","partial":"부분 추출 (오류 확인)","cancelled":"취소됨","invalid":"검증 실패","failed":"추출 실패"}.get(result["state"],result["state"])
            self.status.setText(f"{state} · 맵 {counts['maps']:,} · 이벤트 {counts['events']:,} · 명령 {counts['commands']:,}\n스위치 {result['switches']:,} · 변수 {result['variables']:,} · 이미지 {result['images']:,} · 복원 {result['decrypted']:,} · 실패 {result['asset_failures']:,} · 플러그인 {result['plugins']:,}\n오류 {result['errors']:,} · 경고 {result['warnings']:,} · report.json을 확인하세요.")
            self.log.appendPlainText(self.status.text())
            try:
                issues=load_json(self.last_output/"reports/warnings.json")["data"]
                for item in issues[:100]: self.log.appendPlainText(f"[{item['severity']}] {item['path']}: {item['message']}")
                if len(issues)>100: self.log.appendPlainText("나머지 문제는 reports/warnings.json을 확인하세요.")
            except (OSError,ValueError,KeyError): pass
            self.bar.setRange(0,100); self.bar.setValue(100 if result["state"] in ("complete","complete_with_issues") else 0)
    def on_error(self,message):
        self.status.setText("작업 실패. 입력 파일·출력 폴더·권한을 확인하세요."); self.log.appendPlainText(message)
        self.bar.setRange(0,100); self.bar.setValue(0); QMessageBox.warning(self,"작업을 완료하지 못했습니다","지원 데이터와 폴더 접근 권한을 확인하세요. 자세한 내용은 아래 로그에 표시됩니다.")
    def on_thread_finished(self):
        old=self.thread; self.thread=None; old.deleteLater(); self.set_busy(False); self.show_candidate(self.roots.currentIndex())
    def open_output(self):
        if self.last_output: return QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.last_output)))
        return False
    def closeEvent(self,event):
        if self.thread:
            self.stop.set(); self.status.setText("취소 처리 중입니다. 작업이 멈추면 창을 닫으세요."); event.ignore()
        else: event.accept()

def main():
    if len(sys.argv)==4 and sys.argv[1]=="--gui-smoke-test":
        from .smoke import main as smoke_main
        return smoke_main(sys.argv[2],sys.argv[3])
    app=QApplication.instance() or QApplication(sys.argv)
    app.setStyle("Fusion")
    if os.name=="nt": app.setFont(QFont("Malgun Gothic",10))
    window=MainWindow(); window.show(); return app.exec()

if __name__=="__main__": raise SystemExit(main())

