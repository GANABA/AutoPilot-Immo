from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_price(price: float) -> str:
    return f"{int(price):,}".replace(",", " ") + " €"


def _property_row(p: dict) -> str:
    price = _fmt_price(p.get("price", 0))
    surface = p.get("surface", "?")
    rooms = p.get("nb_rooms", "?")
    city = p.get("city", "")
    title = p.get("title", "Bien immobilier")
    return f"""
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
        <strong style="color:#1a1a2e;font-size:15px;">{title}</strong><br>
        <span style="color:#666;font-size:13px;">{city} &bull; {surface} m² &bull; {rooms} pièces &bull; {price}</span>
      </td>
    </tr>"""


def _base_html(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.5px;">ImmoPlus</h1>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Votre agence immobilière à Lyon</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 20px;color:#1a1a2e;font-size:20px;font-weight:600;">{title}</h2>
            {body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              ImmoPlus — 15 rue de la République, 69001 Lyon<br>
              <a href="tel:+33472000000" style="color:#94a3b8;">+33 4 72 00 00 00</a> &bull;
              <a href="mailto:contact@immoplus.fr" style="color:#94a3b8;">contact@immoplus.fr</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── Send function ─────────────────────────────────────────────────────────────

def send_email(to: str, subject: str, html: str) -> bool:
    """Send an email via SendGrid. Returns True on success, False on failure."""
    if not settings.SENDGRID_API_KEY:
        logger.warning("SendGrid: SENDGRID_API_KEY not set — email not sent to %s", to)
        return False
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=(settings.SENDGRID_FROM_EMAIL, "ImmoPlus"),
            to_emails=to,
            subject=subject,
            html_content=html,
        )
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info("SendGrid: sent '%s' to %s (status %s)", subject, to, response.status_code)
        return True
    except Exception as exc:
        logger.error("SendGrid error: %s", exc, exc_info=True)
        return False


# ── Email templates ───────────────────────────────────────────────────────────

def send_prospect_confirmation(
    prospect_name: str,
    prospect_email: str,
    properties: list[dict],
) -> bool:
    """
    Email sent to the prospect after the chatbot finds matching properties.
    Includes property list + CTA to book a visit.
    """
    first_name = prospect_name.split()[0] if prospect_name else "vous"
    props_html = "".join(_property_row(p) for p in properties[:3]) if properties else ""

    props_section = ""
    if props_html:
        props_section = f"""
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
          Voici les biens de notre catalogue qui correspondent à vos critères :
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">{props_html}</table>
        <br>"""

    body = f"""
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Bonjour <strong>{first_name}</strong>,
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Merci pour votre intérêt. Notre assistant a analysé votre recherche et nous sommes ravis
      de pouvoir vous accompagner dans votre projet immobilier.
    </p>
    {props_section}
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 32px;">
      Pour organiser une visite ou obtenir plus d'informations, répondez simplement à cet email
      ou appelez-nous directement.
    </p>
    <a href="mailto:contact@immoplus.fr?subject=Demande%20de%20visite"
       style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;
              padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Contacter un conseiller
    </a>
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;">
      Notre équipe vous répondra dans les plus brefs délais, du lundi au vendredi de 9h à 19h.
    </p>"""

    return send_email(
        to=prospect_email,
        subject="Vos biens immobiliers sélectionnés — ImmoPlus",
        html=_base_html("Nous avons trouvé des biens pour vous", body),
    )


def send_agent_new_prospect(
    agent_email: str,
    prospect_name: str,
    prospect_email: str,
    properties: list[dict],
    conversation_id: str | None = None,
) -> bool:
    """
    Email sent to the agent when a prospect is qualified (has email + matched properties).
    """
    props_html = "".join(_property_row(p) for p in properties[:3]) if properties else ""
    props_section = ""
    if props_html:
        props_section = f"""
        <p style="color:#475569;font-size:14px;margin:0 0 8px;font-weight:600;">Biens consultés :</p>
        <table width="100%" cellpadding="0" cellspacing="0">{props_html}</table><br>"""

    dashboard_link = f"{settings.PUBLIC_URL.rstrip('/')}/dashboard/conversations"

    body = f"""
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Un nouveau prospect vient d'être qualifié via le chatbot.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;margin:0 0 24px;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 8px;color:#1a1a2e;font-size:15px;">
          <strong>Nom :</strong> {prospect_name or "Non renseigné"}
        </p>
        <p style="margin:0 0 8px;color:#1a1a2e;font-size:15px;">
          <strong>Email :</strong>
          <a href="mailto:{prospect_email}" style="color:#3b82f6;">{prospect_email}</a>
        </p>
      </td></tr>
    </table>
    {props_section}
    <a href="{dashboard_link}"
       style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;
              padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Voir la conversation
    </a>"""

    return send_email(
        to=agent_email,
        subject=f"Nouveau prospect : {prospect_name or prospect_email}",
        html=_base_html("Nouveau prospect qualifié", body),
    )


def send_visit_confirmation(
    prospect_name: str,
    prospect_email: str,
    slot_label: str,
    property_title: str,
) -> bool:
    """Email sent to prospect when a visit is confirmed via the chatbot."""
    first_name = prospect_name.split()[0] if prospect_name else "vous"
    body = f"""
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Bonjour <strong>{first_name}</strong>,
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Votre visite est confirmée. Voici le récapitulatif :
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;margin:0 0 32px;">
      <tr><td style="padding:24px;">
        <p style="margin:0 0 12px;color:#1a1a2e;font-size:16px;">
          <strong>Bien :</strong> {property_title}
        </p>
        <p style="margin:0;color:#1a1a2e;font-size:16px;">
          <strong>Date :</strong> {slot_label.capitalize()}
        </p>
      </td></tr>
    </table>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 32px;">
      Un de nos conseillers vous accueillera sur place. En cas d'empêchement,
      n'hésitez pas à nous contacter pour reprogrammer.
    </p>
    <a href="mailto:contact@immoplus.fr?subject=Modification%20de%20visite"
       style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;
              padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Nous contacter
    </a>"""

    return send_email(
        to=prospect_email,
        subject=f"Confirmation de visite — {property_title}",
        html=_base_html("Votre visite est confirmée", body),
    )


def send_prospect_followup(
    prospect_name: str,
    prospect_email: str,
    properties: list[dict],
) -> bool:
    """
    Follow-up email sent 7 days after initial contact if no visit booked.
    """
    first_name = prospect_name.split()[0] if prospect_name else "vous"
    props_html = "".join(_property_row(p) for p in properties[:3]) if properties else ""
    props_section = ""
    if props_html:
        props_section = f"""
        <p style="color:#475569;font-size:14px;margin:0 0 8px;font-weight:600;">
          Vos biens sélectionnés sont toujours disponibles :
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">{props_html}</table><br>"""

    body = f"""
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Bonjour <strong>{first_name}</strong>,
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Suite à votre recherche de la semaine dernière, nous souhaitons savoir si votre projet
      immobilier avance. Avez-vous eu l'occasion de visiter les biens que nous vous avions
      présentés ?
    </p>
    {props_section}
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 32px;">
      Si vous souhaitez organiser une visite ou si vos critères ont évolué,
      notre équipe est disponible pour vous aider.
    </p>
    <a href="mailto:contact@immoplus.fr?subject=Suivi%20de%20ma%20recherche"
       style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;
              padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Reprendre ma recherche
    </a>"""

    return send_email(
        to=prospect_email,
        subject="Votre recherche immobilière — un suivi personnalisé",
        html=_base_html("Toujours à la recherche du bien idéal ?", body),
    )
