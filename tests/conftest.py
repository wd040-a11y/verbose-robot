from pathlib import Path
import pytest
from tools.sample_factory import create_game
from rpgextractor.pipeline import Extractor

@pytest.fixture
def mv(tmp_path):
 root,png=create_game(tmp_path/"한글 게임 MV","MV")
 return root,png,tmp_path/"export"

@pytest.fixture
def exported(mv):
 root,png,out=mv
 result=Extractor().run(root.parent,out)
 return root,png,Path(result["output_folder"]),result
