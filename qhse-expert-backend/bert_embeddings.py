import sys
import json
import torch
from transformers import BertTokenizer, BertModel
import os

if len(sys.argv) < 2:
    print("Usage: python bert_embeddings.py <qa_pairs_file>")
    sys.exit(1)

qa_pairs_file = sys.argv[1]




# Load pre-trained BERT model and tokenizer
tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
model = BertModel.from_pretrained('bert-base-uncased')

# Define the path for the QA pairs and embeddings file
qa_pairs_path = os.path.join(os.path.dirname(__file__), 'qaPairs.json')
embeddings_path = os.path.join(os.path.dirname(__file__), 'qaEmbeddings.json')

def load_qa_pairs():
    with open(qa_pairs_path, 'r') as f:
        return json.load(f)

def save_embeddings(embeddings):
    with open(embeddings_path, 'w') as f:
        json.dump(embeddings, f, indent=2)

def generate_embeddings(input_file):
    # Load BERT model and tokenizer
    tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    model = BertModel.from_pretrained('bert-base-uncased')

    with open(input_file, 'r') as f:
        qa_pairs = json.load(f)

    embeddings = {}
    for pair in qa_pairs:
        question = pair['question']
        inputs = tokenizer(question, return_tensors='pt')
        with torch.no_grad():
            outputs = model(**inputs)
            embedding = outputs.last_hidden_state.mean(dim=1).numpy().tolist()
            embeddings[question] = embedding

    return embeddings

if __name__ == '__main__':
    input_file = sys.argv[1]
    embeddings = generate_embeddings(input_file)
    print(json.dumps(embeddings))

def main():
    # Load QA pairs
    qa_pairs = load_qa_pairs()

    # Generate embeddings
    embeddings = generate_embeddings(qa_pairs)

    # Save embeddings
    save_embeddings(embeddings)

    print('Embeddings generated and saved successfully.')

if __name__ == "__main__":
    main()
