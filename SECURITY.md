# Security Policy

## Supported Versions

Sawit Finance is currently a Casper Testnet MVP built for the Casper Agentic
Buildathon. Only the latest code on the `main` branch is supported.

| Version        | Supported |
| -------------- | --------- |
| `main` (HEAD)  | ✅        |
| older commits  | ❌        |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead:

1. Use [GitHub private vulnerability reporting](https://github.com/wngstnr-code/Sawit-Finance/security/advisories/new), or
2. Email **wangsitsada1234@gmail.com** with the subject line `[SECURITY] Sawit Finance`.

Include a description of the issue, steps to reproduce, and the potential
impact. You can expect an initial response within **72 hours**.

## Scope

- Odra/CEP-18 smart contracts in `contracts/` (deployed on Casper **Testnet** only)
- AI agents and MCP server in `agents/`
- x402 facilitator and payment flow in `agents/x402-official/`
- Next.js frontend in `frontend/`

Note that all contracts hold **testnet CSPR only** — there are no mainnet
deployments and no real funds at risk at this stage.
