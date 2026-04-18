import os
import sys

from flask import Flask
from flask_cors import CORS
from strawberry.flask.views import GraphQLView


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


from schema import schema


def _assert_expected_schema(active_schema):
    # Guard against accidentally serving an older schema contract.
    sdl = active_schema.as_str()
    required_tokens = ("materialType", "mrpController", "materialCatalogFilters")
    missing = [token for token in required_tokens if token not in sdl]
    if missing:
        raise RuntimeError(
            "Loaded GraphQL schema is missing expected fields/args: " + ", ".join(missing)
        )


_assert_expected_schema(schema)

app = Flask(__name__)
CORS(app)

app.add_url_rule(
    "/graphql",
    view_func=GraphQLView.as_view("graphql_view", schema=schema),
)

if __name__ == "__main__":
    app.run(debug=False, port=5000, threaded=False)
