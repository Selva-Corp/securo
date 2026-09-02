"""Symmetric encryption for stored secrets (fork shim).

Re-exports the Fernet helpers the agents module already keys from
``SECRET_KEY``, so core features (notification channel tokens) can depend on
``app.core`` rather than reaching into ``app.agents``.
"""

from app.agents.services.crypto import decrypt, encrypt

__all__ = ["encrypt", "decrypt"]
