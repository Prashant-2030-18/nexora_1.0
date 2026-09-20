import io
import csv
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from ..models import State, District, Road, LogisticsHub, Warehouse, Incident, InfrastructureGap, Shipment
from ..services.accessibility_engine import compute_district_accessibility
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_csv_report(db: Session, report_type: str) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "state_accessibility":
        writer.writerow(["State ID", "State Name", "State Code", "Avg Accessibility Score (0-100)", "Population"])
        states = db.query(State).all()
        for s in states:
            dists = db.query(District).filter(District.state_id == s.id).all()
            scs = [compute_district_accessibility(d).get("score") for d in dists]
            scs = [x for x in scs if x is not None]
            avg_s = round(sum(scs) / max(1, len(scs)), 1) if scs else 50.0
            writer.writerow([s.id, s.name, s.code, avg_s, s.population])

    elif report_type == "district_accessibility":
        writer.writerow(["District Name", "State", "Latitude", "Longitude", "Accessibility Score", "Status", "Road Density (km/sq km)", "Nearest Highway (km)", "Nearest Rail (km)"])
        districts = db.query(District).all()
        for d in districts:
            acc = compute_district_accessibility(d)
            writer.writerow([
                d.name,
                d.state_rel.name if d.state_rel else "NER",
                d.latitude,
                d.longitude,
                acc.get("score") if acc.get("score") is not None else "Unavailable",
                acc.get("status", "available"),
                d.road_density_km_per_sq_km,
                d.distance_to_nearest_highway_km,
                d.distance_to_nearest_railway_km
            ])

    elif report_type == "logistics_performance":
        writer.writerow(["Shipment Number", "Origin", "Destination", "Cargo Type", "Cargo Weight (T)", "Status", "ETA", "Cost (INR)"])
        shipments = db.query(Shipment).all()
        for sh in shipments:
            writer.writerow([
                sh.shipment_number,
                sh.origin_address,
                sh.destination_address,
                sh.cargo_type,
                sh.cargo_weight_tonnes,
                sh.status,
                sh.estimated_eta,
                sh.estimated_cost_inr
            ])

    elif report_type == "disaster_impact":
        writer.writerow(["Incident ID", "Title", "Type", "Severity", "State", "District", "Affected Route", "Status", "Expected Duration", "Created At"])
        incidents = db.query(Incident).all()
        for inc in incidents:
            writer.writerow([inc.id, inc.title, inc.type, inc.severity, inc.state, inc.district, inc.affected_route, inc.status, inc.expected_duration, inc.created_at])

    else: # infrastructure_gaps
        writer.writerow(["Gap ID", "District", "State", "Gap Type", "Severity", "Description", "Recommended Action", "Estimated Impact"])
        gaps = db.query(InfrastructureGap).all()
        for g in gaps:
            writer.writerow([g.id, g.district, g.state, g.gap_type, g.severity, g.description, g.recommended_action, g.estimated_impact])

    return output.getvalue()

def generate_pdf_report(db: Session, report_type: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        alignment=1,
        spaceAfter=12
    )
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
        alignment=1,
        spaceAfter=18
    )

    story.append(Paragraph("Ministry of Development of North Eastern Region (MDoNER)", title_style))
    story.append(Paragraph("NEXORA AI Smart Logistics & Accessibility Intelligence Platform", subtitle_style))
    story.append(Spacer(1, 10))

    if report_type == "state_accessibility":
        story.append(Paragraph("<b>Official Executive Report: State-wise Accessibility Index</b>", styles['Heading2']))
        story.append(Spacer(1, 8))
        states = db.query(State).all()
        table_data = [["State Name", "Code", "Avg Accessibility", "Population"]]
        for s in states:
            dists = db.query(District).filter(District.state_id == s.id).all()
            scs = [compute_district_accessibility(d).get("score") for d in dists if compute_district_accessibility(d).get("score") is not None]
            avg_s = round(sum(scs) / max(1, len(scs)), 1) if scs else 50.0
            table_data.append([s.name, s.code, f"{avg_s}/100", f"{(s.population or 0):,}"])

    elif report_type == "disaster_impact":
        story.append(Paragraph("<b>Live Disaster & Disruption Intelligence Briefing</b>", styles['Heading2']))
        story.append(Spacer(1, 8))
        incidents = db.query(Incident).all()
        table_data = [["Incident", "Type", "Severity", "State", "Affected Route", "Status"]]
        for inc in incidents:
            table_data.append([inc.title[:25], inc.type, inc.severity, inc.state, (inc.affected_route or "Corridor")[:20], inc.status])

    elif report_type == "infrastructure_gaps":
        story.append(Paragraph("<b>Strategic Infrastructure Gaps & Investment Priority Report</b>", styles['Heading2']))
        story.append(Spacer(1, 8))
        gaps = db.query(InfrastructureGap).all()
        table_data = [["District", "State", "Gap Type", "Severity", "Impact Uplift"]]
        for g in gaps:
            table_data.append([g.district, g.state, g.gap_type[:20], g.severity, g.estimated_impact[:25]])

    else:
        story.append(Paragraph("<b>NER Multi-Modal Logistics Performance Report</b>", styles['Heading2']))
        story.append(Spacer(1, 8))
        shipments = db.query(Shipment).limit(10).all()
        table_data = [["Shipment ID", "Origin", "Destination", "Cargo", "ETA", "Status"]]
        for sh in shipments:
            table_data.append([sh.shipment_number, sh.origin_address[:15], sh.destination_address[:15], sh.cargo_type[:15], sh.estimated_eta or "In Transit", sh.status])

    t = Table(table_data, colWidths=None)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0284c7")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t)
    story.append(Spacer(1, 20))
    story.append(Paragraph("<i>Generated by NEXORA Autonomous Multi-Modal GIS Intelligence Platform.</i>", styles['Italic']))

    doc.build(story)
    return buffer.getvalue()
