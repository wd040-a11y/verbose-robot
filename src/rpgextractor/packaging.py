"""Create a lightweight player package without copying media or archival data."""
from pathlib import Path
import zipfile


def story_package(output, cancel=lambda: None, *, media=False):
    root = Path(output).resolve()
    name = 'Game.zip' if media else 'Story.zip'
    target = root / name
    temporary = root / (name+'.partial')
    if target.exists():
        raise FileExistsError('기존 '+name+'을 덮어쓰지 않습니다.')
    try:
        with zipfile.ZipFile(temporary, 'x', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            for folder in ('normalized', 'events', 'schemas') + (('assets',) if media else ()):
                for path in sorted((root / folder).rglob('*')):
                    cancel()
                    if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root):
                        archive.write(path, path.relative_to(root).as_posix())
            archive.write(root / 'manifest.json', 'manifest.json')
        temporary.rename(target)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    return target
