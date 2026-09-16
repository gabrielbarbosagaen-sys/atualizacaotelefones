"""Gera supabase/colaboradores_import.csv a partir da planilha Base_colaboradores_.xlsx.

Uso:
    python scripts/generate_import_csv.py

Reexecute este script sempre que a base de colaboradores (planilha original) mudar,
e reimporte o CSV gerado na tabela `colaboradores` do Supabase.
"""
import csv
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
ORIGEM = ROOT / "Base_colaboradores_.xlsx"
DESTINO = ROOT / "supabase" / "colaboradores_import.csv"


def main() -> None:
    if not ORIGEM.exists():
        sys.exit(f"Arquivo não encontrado: {ORIGEM}")

    wb = openpyxl.load_workbook(ORIGEM, data_only=True)
    ws = wb["GERAL"]

    linhas = []
    vistos = set()
    for row in ws.iter_rows(min_row=2, values_only=True):
        cadastro, nome, filial, departamento = row[0], row[1], row[2], row[3]
        if cadastro is None or nome is None:
            continue
        cadastro = int(cadastro)
        if cadastro in vistos:
            sys.exit(f"Cadastro duplicado encontrado: {cadastro} — corrija a planilha antes de importar.")
        vistos.add(cadastro)
        linhas.append(
            {
                "cadastro": cadastro,
                "nome": str(nome).strip(),
                "filial": str(filial).strip(),
                "departamento": str(departamento).strip(),
            }
        )

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    with DESTINO.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["cadastro", "nome", "filial", "departamento"])
        writer.writeheader()
        writer.writerows(linhas)

    print(f"OK: {len(linhas)} colaboradores exportados para {DESTINO}")


if __name__ == "__main__":
    main()
