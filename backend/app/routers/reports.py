from fastapi import APIRouter, Depends, Query, Response, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.report_generator import generate_csv_report, generate_pdf_report

router = APIRouter(prefix="/api/reports", tags=["Reports & Exports"])

@router.get("/download")
def download_report(
    report_type: str = Query("state_accessibility", description="state_accessibility, district_accessibility, logistics_performance, disaster_impact, infrastructure_gaps"),
    file_format: str = Query("pdf", description="pdf or csv"),
    db: Session = Depends(get_db)
):
    if file_format.lower() == "csv":
        csv_data = generate_csv_report(db, report_type)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={report_type}_report.csv"}
        )
    elif file_format.lower() == "pdf":
        try:
            pdf_bytes = generate_pdf_report(db, report_type)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={report_type}_report.pdf"}
            )
        except Exception as e:
            # Fallback to CSV if PDF rendering encounters any font issue
            csv_data = generate_csv_report(db, report_type)
            return Response(
                content=csv_data,
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename={report_type}_report.csv"}
            )
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'pdf' or 'csv'.")
