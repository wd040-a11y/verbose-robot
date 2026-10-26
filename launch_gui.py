"""Source-tree and PyInstaller GUI entrypoint."""
import sys
from pathlib import Path
if not getattr(sys,"frozen",False): sys.path.insert(0,str(Path(__file__).parent/"src"))
from rpgextractor.gui import main
if __name__=="__main__": raise SystemExit(main())
