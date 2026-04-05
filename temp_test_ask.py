import sys
sys.path.append('ml_engine')
sys.path.append('ml_engine/pipeline')
from query_engine import RAGEngine

engine = RAGEngine()
engine.load_document('dummy_sales_data.csv', 'dummy_sales_data.csv')

print("Sending question to ask()...")
res = engine.ask("fill all nan value in gender column with 'M'", role='admin', permissions=['read', 'fill_null', 'update', 'delete'])
print("Result:")
print(res)
