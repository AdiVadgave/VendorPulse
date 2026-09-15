"""
Vendor management routes.

GET  /api/vendors     — List all vendors (predefined + dynamically added)
GET  /api/categories  — List all unique categories (defaults + from vendors)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_vendor_repo

router = APIRouter(tags=["vendors"])

_DEFAULT_CATEGORIES = ["IT Infrastructure", "Software Development", "Managed Services"]


@router.get("/api/vendors")
def list_vendors(vendor_repo=Depends(get_vendor_repo)):
    return {"vendors": vendor_repo.find_all()}


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
