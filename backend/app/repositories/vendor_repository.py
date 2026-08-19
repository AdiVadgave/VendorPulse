from __future__ import annotations

from typing import Optional

from app.repositories.base_repository import BaseRepository


class VendorRepository(BaseRepository):
    table = "vendors"
    pk = "vendor_id"
    columns = ("vendor_id", "name", "category", "status")

    def get_by_vendor_id(self, vendor_id: str) -> Optional[dict]:
        return self.find_by_id("vendor_id", vendor_id)

    def find_by_name(self, name: str) -> Optional[dict]:
        """Case-insensitive name lookup (index-backed on lower(name))."""
        rows = self._select(' WHERE lower("name") = %s', (name.strip().lower(),))
        return rows[0] if rows else None

    def find_or_create(self, name: str, vendor_id: str, category: str = "Custom") -> dict:
        """Return the vendor with the given name if it exists, otherwise insert
        a new one with `vendor_id` and return it."""
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
