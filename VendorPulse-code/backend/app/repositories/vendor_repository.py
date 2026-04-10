from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.repositories.base_repository import BaseRepository


class VendorRepository(BaseRepository):
    def __init__(self, data_dir: Path) -> None:
        super().__init__("vendors.json", data_dir)

    def get_by_vendor_id(self, vendor_id: str) -> Optional[dict]:
        return self.find_by_id("vendor_id", vendor_id)

    def find_by_name(self, name: str) -> Optional[dict]:
        """Case-insensitive name lookup."""
        name_lower = name.strip().lower()
        return next(
            (v for v in self._read() if v.get("name", "").lower() == name_lower),
            None,
        )

    def find_or_create(self, name: str, vendor_id: str, category: str = "Custom") -> dict:
        """
        Return the vendor with the given name if it exists, otherwise insert
        a new one with `vendor_id` and return it.
        """
        existing = self.find_by_name(name)
        if existing:
            return existing
        new_vendor = {
            "vendor_id": vendor_id,
            "name": name.strip(),
            "category": category,
            "status": "active",
        }
        self.insert(new_vendor)
        return new_vendor
