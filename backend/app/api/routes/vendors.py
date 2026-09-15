"""
Vendor management routes.

GET   /api/vendors            — List all vendors (predefined + dynamically added)
PATCH /api/vendors/{vendor_id} — Rename a vendor (fix typos); propagates to all
                                 cycles since cycle.vendor_name is derived, not stored
GET   /api/categories        — List all unique categories (defaults + from vendors)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.dependencies import get_vendor_repo

router = APIRouter(tags=["vendors"])

_DEFAULT_CATEGORIES = ["IT Infrastructure", "Software Development", "Managed Services"]


class VendorRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def _trim_non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Vendor name cannot be empty.")
        return v


@router.get("/api/vendors")
def list_vendors(vendor_repo=Depends(get_vendor_repo)):
    return {"vendors": vendor_repo.find_all()}


@router.patch("/api/vendors/{vendor_id}")
def rename_vendor(vendor_id: str, payload: VendorRename, vendor_repo=Depends(get_vendor_repo)):
    """Rename an existing vendor (typo fix). The new name must be unique
    (case-insensitive) across other vendors so two vendors can't collide."""
    existing = vendor_repo.get_by_vendor_id(vendor_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Vendor not found.")

    # Reject a name already used by a *different* vendor (case-insensitive).
    clash = vendor_repo.find_by_name(payload.name)
    if clash is not None and clash.get("vendor_id") != vendor_id:
        raise HTTPException(
            status_code=409,
            detail=f'Another vendor is already named "{payload.name}".',
        )

    updated = vendor_repo.update_by_id("vendor_id", vendor_id, {"name": payload.name})
    if updated is None:
        raise HTTPException(status_code=404, detail="Vendor not found.")
    return {"vendor": updated}


@router.get("/api/categories")
def list_categories(vendor_repo=Depends(get_vendor_repo)):
    """Return all unique categories: defaults merged with any saved on vendor records."""
    vendor_categories = {
        v.get("category")
        for v in vendor_repo.find_all()
        if v.get("category")
    }
    all_categories = sorted(set(_DEFAULT_CATEGORIES) | vendor_categories)
    return {"categories": all_categories}
