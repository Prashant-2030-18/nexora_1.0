import os
import re
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

from ..models import (
    State, District, Warehouse, Vehicle, Shipment,
    DisasterAlert, UserReport, InfrastructureGap, Incident, Road
)
from ..config import settings
from .weather_service import get_weather_for_city, get_weather_for_location
from .accessibility_engine import get_all_accessibility_scores
from .simulation_engine import run_what_if_simulation
from .sachet_service import get_sachet_sync_status

# Recommended Gemini model priorities supported by the configured key
GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-3.8-flash"]

def _extract_cities_from_query(query: str) -> List[str]:
    """Identify NER cities or states mentioned in query."""
    CITIES = [
        "guwahati", "shillong", "silchar", "imphal", "kohima", "dimapur",
        "aizawl", "agartala", "gangtok", "itanagar", "dibrugarh", "jorhat",
        "tezpur", "haflong", "tura", "nagaon", "churachandpur", "lunglei"
    ]
    q = query.lower()
    found = [c for c in CITIES if c in q]
    return found

def _detect_query_intent(query: str) -> str:
    """Classify the user query to retrieve domain-specific factual context."""
    q = query.lower()
    # Check simulation first so "What happens if NH-27 is closed?" maps to SIMULATION
    if any(w in q for w in ["what if", "scenario", "closure", "closed", "blocked corridor", "new hub", "if nh-"]):
        return "SIMULATION"
    if any(w in q for w in ["disaster", "flood", "landslide", "cyclone", "sachet", "hazard", "blocked by rain"]):
        return "DISASTER"
    if any(w in q for w in ["weather", "rainfall", "rain", "temperature", "forecast", "visibility", "wind"]):
        return "WEATHER"
    if any(w in q for w in ["accessibility", "isolated", "connectivity", "scorecard", "bottleneck", "poor road"]):
        return "ACCESSIBILITY"
    if any(w in q for w in ["route", "safest route", "fastest route", "how to reach", "travel time", "distance from", "nh-", "corridor"]):
        return "ROUTE"
    if any(w in q for w in ["invest", "hub", "infrastructure", "warehouse", "cold storage", "gap"]):
        return "INFRASTRUCTURE"
    return "GENERAL"

def _build_grounded_context(query: str, db: Session, context_state: Optional[str] = "All", nav_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Fetch factual, verified database records matching the user's inquiry.
    Returns: (context_text, data_points, suggested_actions)
    """
    intent = _detect_query_intent(query)
    lines: List[str] = []
    data_points: List[Dict[str, Any]] = []
    suggested_actions: List[Dict[str, Any]] = []

    # 0. Live Navigation Context if active
    if nav_context and any(nav_context.values()):
        lines.append("=== LIVE ACTIVE NAVIGATION & VEHICLE TELEMETRY ===")
        if nav_context.get("current_location"):
            lines.append(f"• Current Location: {nav_context['current_location']}")
        if nav_context.get("destination"):
            lines.append(f"• Destination: {nav_context['destination']}")
        if nav_context.get("current_speed") is not None:
            lines.append(f"• Vehicle Speed: {nav_context['current_speed']} km/h")
        else:
            lines.append("• Vehicle Speed: SPEED UNAVAILABLE")
        if nav_context.get("gps_accuracy") is not None:
            lines.append(f"• GPS Precision: ±{round(nav_context['gps_accuracy'])} meters")
        if nav_context.get("eta"):
            lines.append(f"• Estimated Duration (ETA): {nav_context['eta']}")
        if nav_context.get("remaining_distance_km") is not None:
            lines.append(f"• Remaining Distance: {nav_context['remaining_distance_km']} km")
        if nav_context.get("route_risk") is not None:
            lines.append(f"• Active Corridor Risk: {nav_context['route_risk']}/100")
        if nav_context.get("navigation_state"):
            lines.append(f"• Navigation Corridor Status: {nav_context['navigation_state']}")

        hazards = nav_context.get("hazards") or []
        verified_hazards = [
            h for h in hazards
            if h.get("verified") is True or str(h.get("source", "")).upper() in ("NDMA_SACHET", "SACHET_NDMA", "NDMA SACHET")
        ]
        user_hazards = [
            h for h in hazards
            if str(h.get("source", "")).upper() in ("USER_REPORTED", "USER") or (
                h.get("verified") is False and h not in verified_hazards
            )
        ]
        # Deduplicate: keep user list free of official alerts
        verified_ids = {id(h) for h in verified_hazards}
        user_hazards = [h for h in user_hazards if id(h) not in verified_ids]

        regional = nav_context.get("regional_alerts") or []
        sachet_feed = nav_context.get("sachet_status") or {}

        lines.append(f"\n--- CORRIDOR DISASTER ANALYSIS ({len(hazards)} hazards intersecting active route) ---")
        if sachet_feed:
            lines.append(
                f"• SACHET feed status: {sachet_feed.get('statusBadge') or sachet_feed.get('status') or 'UNKNOWN'} "
                f"(never treat CACHED/UNAVAILABLE as LIVE)"
            )
        if not hazards:
            lines.append("• No verified disaster currently intersects this route.")
        else:
            if verified_hazards:
                lines.append(f"• This route intersects an official SACHET alert ({len(verified_hazards)}):")
                for vh in verified_hazards:
                    lines.append(
                        f"  - [NDMA SACHET ✓ VERIFIED] {vh.get('type') or 'Disaster'} ({vh.get('severity')}) "
                        f"~{vh.get('distance_km')}km: {vh.get('title') or vh.get('description')}"
                    )
            else:
                lines.append("• No verified disaster currently intersects this route.")

            if user_hazards:
                lines.append(f"• This route has an unverified user report ({len(user_hazards)}):")
                for uh in user_hazards:
                    lines.append(
                        f"  - [USER REPORTED ⚠ UNVERIFIED] {uh.get('type') or 'Hazard'} ({uh.get('severity')}) "
                        f"~{uh.get('distance_km')}km: {uh.get('description') or uh.get('title')}"
                    )

        if regional:
            lines.append(f"• Regional alerts exist outside the selected route ({len(regional)}).")
        elif not hazards:
            lines.append("• Regional SACHET alerts outside this corridor: none loaded for current filter.")

    # 1. Base Platform Summary
    states_count = db.query(State).count()
    districts_count = db.query(District).count()
    active_alerts_q = db.query(DisasterAlert).filter(DisasterAlert.is_active == True)
    if context_state and context_state.lower() != "all":
        active_alerts_q = active_alerts_q.filter(DisasterAlert.area_description.ilike(f"%{context_state}%"))
    active_alerts = active_alerts_q.all()

    lines.append("\n=== NEXORA LIVE DATABASE TELEMETRY ===")
    lines.append(f"Jurisdiction Coverage: 8 NER States, {districts_count} Districts")
    lines.append(f"Active Official Disaster Alerts (SACHET NDMA): {len(active_alerts)}")

    try:
        sachet_status = get_sachet_sync_status(db)
        lines.append(
            f"SACHET connection: {sachet_status.get('statusBadge') or sachet_status.get('status')} | "
            f"ETag: {'present' if sachet_status.get('etagPresent') else 'none'} | "
            f"Last success: {sachet_status.get('lastSuccessfulFetch') or sachet_status.get('last_successful_fetch_time') or 'Never'}"
        )
        if sachet_status.get("statusCode") in ("CACHED", "UNAVAILABLE", "NOT_CONFIGURED") or (
            sachet_status.get("status") in ("CACHED OFFICIAL DATA", "FEED UNAVAILABLE", "NOT CONFIGURED")
        ):
            lines.append("IMPORTANT: SACHET data is cached or unavailable — do not claim LIVE official feed.")
    except Exception:
        lines.append("SACHET status: UNAVAILABLE (status check failed)")

    # 2. Intent-Specific Grounding
    if intent == "DISASTER":
        lines.append("\n--- ACTIVE SACHET NDMA DISASTER ALERTS ---")
        if active_alerts:
            for a in active_alerts[:8]:
                lines.append(f"• [{a.severity}] {a.headline} | Location: {a.area_description} | Details: {a.description}")
                data_points.append({
                    "Alert": a.headline,
                    "Severity": a.severity,
                    "Location": a.area_description,
                })
        else:
            lines.append("No active disaster alerts registered in database for this region.")

        # Also citizen disaster reports with AI verification status
        ai_verified = db.query(UserReport).filter(
            UserReport.status != "DELETED",
            (UserReport.verification_status == "AI_VERIFIED") | (UserReport.status.in_(["APPROVED", "Verified", "Active"]))
        ).all()
        if ai_verified:
            lines.append("\n--- AI-VERIFIED CITIZEN DISASTER REPORTS ---")
            for r in ai_verified[:5]:
                conf_pct = int((r.ai_confidence or 0.8) * 100)
                corrob_str = f" [Corroborations: {r.corroboration_count}]" if (r.corroboration_count and r.corroboration_count > 1) else ""
                lines.append(f"• [AI VERIFIED CITIZEN REPORT ({conf_pct}% confidence){corrob_str}] {r.disaster_type} at {r.location_name} ({r.severity}) - {r.description}")

        ai_review = db.query(UserReport).filter(
            UserReport.status != "DELETED",
            (UserReport.verification_status == "AI_REVIEW") | (UserReport.status.in_(["PENDING", "Pending Verification"]))
        ).all()
        if ai_review:
            lines.append("\n--- UNCONFIRMED CITIZEN ADVISORIES (AI REVIEW REQUIRED) ---")
            for r in ai_review[:3]:
                lines.append(f"• [AI REVIEW REQUIRED - UNCONFIRMED] {r.disaster_type} at {r.location_name} ({r.severity}) - {r.description}")

        suggested_actions.append({"label": "View Live Disaster Map", "action": "/live-disasters"})
        suggested_actions.append({"label": "Check Citizen Reports", "action": "/citizen-portal"})

    elif intent == "WEATHER":
        cities = _extract_cities_from_query(query)
        if not cities:
            cities = ["guwahati", "shillong", "silchar", "imphal"]

        lines.append("\n--- LIVE WEATHER OBSERVATIONS (OpenWeatherMap) ---")
        for city in cities[:4]:
            w = get_weather_for_city(city, db)
            if w.get("available"):
                lines.append(
                    f"• {w.get('location_name')}: {w.get('temperature_c')}°C, {w.get('condition_text')}, "
                    f"Rain: {w.get('rainfall_mm')} mm, Wind: {w.get('wind_speed_kmh')} km/h, "
                    f"Logistics Impact: {w.get('logistics_impact')}"
                )
                data_points.append({
                    "City": w.get("location_name"),
                    "Temp": f"{w.get('temperature_c')}°C",
                    "Condition": w.get("condition_text"),
                    "Impact": w.get("logistics_impact")
                })
            else:
                lines.append(f"• {city.title()}: Live weather data unavailable")

        suggested_actions.append({"label": "View Live Weather", "action": "/routes"})

    elif intent == "ACCESSIBILITY":
        lines.append("\n--- DISTRICT ACCESSIBILITY SCORES (MDoNER Deterministic Index) ---")
        scores = get_all_accessibility_scores(db, context_state)
        # Lowest 5 districts
        lowest = scores[:5] if scores else []
        for d in lowest:
            dist_name = d.get('district_name') or d.get('district') or 'Unknown District'
            lines.append(
                f"• {dist_name} ({d.get('state_name')}): Score {d.get('score')}/100 "
                f"[{d.get('priority_level')} Priority] | Bottlenecks: {', '.join(d.get('bottlenecks', [])[:2])}"
            )
            data_points.append({
                "District": dist_name,
                "Score": f"{d.get('score')}/100",
                "Priority": d.get("priority_level"),
            })

        suggested_actions.append({"label": "View Accessibility Scorecard", "action": "/accessibility"})
        suggested_actions.append({"label": "Evaluate Logistics Hub Site", "action": "/hub-planner"})

    elif intent == "ROUTE":
        cities = _extract_cities_from_query(query)
        origin = cities[0].title() if len(cities) >= 1 else "Guwahati"
        destination = cities[1].title() if len(cities) >= 2 else "Imphal"

        lines.append(f"\n--- ROUTE LOGISTICS TELEMETRY: {origin} to {destination} ---")
        try:
            from .route_engine import calculate_smart_routes
            route_res = calculate_smart_routes(
                origin_name=origin,
                destination_name=destination,
                vehicle_type="Heavy Duty Truck",
                cargo_type="Essential Commodities",
                cargo_weight_tonnes=10.0,
                avoid_disasters=True,
                db=db
            )
            if "routes" in route_res:
                routes = route_res["routes"]
                for rkey, rval in routes.items():
                    lines.append(
                        f"• {rval.get('strategy')} Strategy: {rval.get('distance_km')} km, "
                        f"ETA: {rval.get('eta_formatted')}, Fuel: Rs.{rval.get('fuel_cost_inr')}, "
                        f"Hazards on Route: {rval.get('hazards_on_route')}, Risk Score: {rval.get('risk_score')}/100"
                    )
                if route_res.get("hazard_warning"):
                    lines.append(f"CRITICAL WARNING: {route_res.get('hazard_warning')}")

                data_points.append({
                    "Route": f"{origin} -> {destination}",
                    "Fastest Distance": f"{routes.get('fastest', {}).get('distance_km')} km",
                    "Safest Risk": f"{routes.get('safest', {}).get('risk_score')}/100",
                })
        except Exception as r_err:
            lines.append(f"Route calculation notes: Real OSRM corridor for {origin} -> {destination}: {r_err}")

        suggested_actions.append({"label": "Open Smart Route Planner", "action": "/routes"})

    elif intent == "SIMULATION":
        lines.append("\n--- WHAT-IF INFRASTRUCTURE SCENARIO PROJECTION ---")
        road_target = "NH-6 (Shillong-Silchar Axis)" if "nh-6" in query.lower() else "NH-27 (East-West Corridor)"
        sim = run_what_if_simulation(db, "close_highway", {"road_name": road_target})
        lines.append(f"Scenario: Complete Blockage of {road_target}")
        lines.append(f"• Travel Time Shift: +{sim.get('travel_time_change_pct')}%")
        lines.append(f"• Freight Cost Shift: +{sim.get('cost_change_pct')}%")
        lines.append(f"• Disruption Loss: {sim.get('economic_benefit_inr')}")
        lines.append(f"• Strategic Mitigation Advice: {sim.get('ai_strategic_advice')}")

        data_points.append({
            "Scenario": f"Closure of {road_target}",
            "Time Delay": f"+{sim.get('travel_time_change_pct')}%",
            "Cost Impact": f"+{sim.get('cost_change_pct')}%"
        })
        suggested_actions.append({"label": "Open What-If Simulator", "action": "/what-if"})

    else:
        # General overview
        warehouses = db.query(Warehouse).count()
        highways = db.query(Road).count()
        gaps = db.query(InfrastructureGap).limit(4).all()

        lines.append(f"Infrastructure Assets: {highways} Strategic Highways, {warehouses} Warehouses & Staging Hubs")
        if gaps:
            lines.append("Key Infrastructure Bottlenecks:")
            for g in gaps:
                lines.append(f"• {g.district} ({g.state}): {g.gap_type} — {g.recommended_action}")

        suggested_actions.append({"label": "Review Infrastructure Gaps", "action": "/infrastructure-gaps"})
        suggested_actions.append({"label": "Explore GIS Corridor Map", "action": "/map"})

    return {
        "context_text": "\n".join(lines),
        "intent": intent,
        "data_points": data_points,
        "suggested_actions": suggested_actions
    }

def ask_copilot(query: str, db: Session, context_state: Optional[str] = "All", nav_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Answer logistics, disaster, or infrastructure queries grounded strictly in live DB data.
    Uses Google Gemini with verified model fallback (gemini-flash-latest / gemini-3.6-flash).
    """
    now_str = datetime.now(timezone.utc).isoformat()
    grounded = _build_grounded_context(query, db, context_state, nav_context)
    context_text = grounded["context_text"]
    data_points = grounded["data_points"]
    suggested_actions = grounded["suggested_actions"]

    # If Gemini API Key is missing or unconfigured
    if not settings.is_gemini_configured:
        return {
            "answer": (
                "### ⚠️ Google Gemini API Key Not Configured\n\n"
                "Please configure `GEMINI_API_KEY` in `backend/.env` to enable natural language generative reasoning.\n\n"
                "**Live Database Telemetry Available for Your Query:**\n\n"
                f"{context_text}"
            ),
            "grounded_on": "NEXORA SQLite Production Database (Rule Grounding Engine)",
            "timestamp": now_str,
            "data_points": data_points,
            "suggested_actions": suggested_actions,
            "disclaimer": "Ground database telemetry. Set GEMINI_API_KEY for full AI generative reasoning."
        }

    # Gemini Generation with verified models
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)

        system_instruction = (
            "You are NEXORA AI Copilot, the official AI decision support system for MDoNER "
            "(Ministry of Development of North Eastern Region, Government of India).\n"
            "Your objective: Deliver concise, authoritative, and actionable decision support for logistics "
            "operators, disaster managers, and government policy planners across the 8 North Eastern States of India.\n\n"
            "STRICT FACTUAL GROUNDING RULES:\n"
            "1. Answer ONLY using the facts from the database and telemetry context provided below.\n"
            "2. NEVER invent disaster alerts, weather conditions, road closures, accessibility scores, or routes.\n"
            "3. If the required data is not in the context, explicitly state: "
            "'Required data is currently unavailable in the database. I cannot provide a verified answer for this query.'\n"
            "4. Format answers using clean GitHub markdown with bold headers and bullet points.\n"
            "5. When discussing routes or hazards, specify exact highways, distances, and affected districts.\n"
            "6. ROUTE SAFETY & DISASTER REPORTING RULES:\n"
            "   - If the user asks if their route is safe and there is NO verified disaster on the route, explicitly state: "
            "'No verified disaster is currently detected on your selected route.'\n"
            "   - Clearly distinguish between:\n"
            "     * OFFICIAL NDMA SACHET: Official Government Verified Alert.\n"
            "     * AI VERIFIED CITIZEN REPORT: Citizen-submitted ground hazard confirmed by NEXORA multi-signal AI verification.\n"
            "     * AI REVIEW REQUIRED (UNCONFIRMED): Unverified citizen advisory; cautionary only, does not block routing.\n"
            "   - NEVER label citizen reports as 'OFFICIAL' or 'NDMA VERIFIED'."
        )

        prompt = (
            f"{system_instruction}\n\n"
            f"=== LIVE GROUNDED CONTEXT ===\n"
            f"{context_text}\n"
            f"=== END CONTEXT ===\n\n"
            f"User Question: {query}\n"
            f"Context State Domain: {context_state}\n\n"
            "Authoritative Response:"
        )

        response_text = None
        model_used = None
        last_err = None

        # Try models in order of availability
        for m_name in GEMINI_MODELS:
            try:
                model = genai.GenerativeModel(m_name)
                resp = model.generate_content(prompt, request_options={"timeout": 5.0})
                if resp and resp.text:
                    response_text = resp.text
                    model_used = m_name
                    break
            except Exception as m_err:
                last_err = m_err
                print(f"[COPILOT] Model {m_name} note: {m_err}")
                continue

        if not response_text:
            raise RuntimeError(f"All configured Gemini models returned empty or failed. Last error: {last_err}")

        return {
            "answer": response_text,
            "grounded_on": f"Google Gemini ({model_used}) grounded on NEXORA Live DB + SACHET NDMA + OpenWeatherMap",
            "timestamp": now_str,
            "data_points": data_points,
            "suggested_actions": suggested_actions,
            "disclaimer": "Official MDoNER decision support advisory. Grounded on live telemetry."
        }

    except Exception as e:
        print(f"[COPILOT] Gemini execution error: {e}")
        return {
            "answer": (
                f"### ⚠️ AI Processing Error\n\n"
                f"An error occurred while communicating with the Gemini API: `{str(e)}`.\n\n"
                "**Factual Ground Data Retrieved from Database:**\n\n"
                f"{context_text}"
            ),
            "grounded_on": "NEXORA Fallback Grounding Engine",
            "timestamp": now_str,
            "data_points": data_points,
            "suggested_actions": suggested_actions,
            "disclaimer": "Direct database telemetry fallback."
        }
