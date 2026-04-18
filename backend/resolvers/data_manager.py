import db


def get_db_tables():
    return db.get_db_tables()


def get_table_preview(table_name: str, limit: int = 100, offset: int = 0):
    return db.get_table_preview(table_name, limit, offset)


def get_imported_datasets():
    return db.get_imported_datasets()


def do_import_dataset(name: str, csv_content: str, target_table: str, column_mapping_json: str):
    import json
    mapping = {}
    if column_mapping_json:
        try:
            mapping = json.loads(column_mapping_json)
        except Exception:
            pass
    return db.import_csv_to_table(name, csv_content, target_table, mapping)


def do_remove_dataset(name: str) -> bool:
    return db.remove_dataset(name)
