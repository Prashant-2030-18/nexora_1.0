from fastapi import APIRouter
from ..services.prediction_engine import get_predictive_intelligence_data

router = APIRouter(prefix="/api/predictions", tags=["Risk & Disaster Predictions"])

@router.get("")
def get_predictions():
    return get_predictive_intelligence_data()
