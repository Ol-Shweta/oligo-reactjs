import sys
import json
import torch
from transformers import BertTokenizer, BertModel

def generate_embeddings(qa_pairs):
    tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    model = BertModel.from_pretrained('bert-base-uncased')

    embeddings = {}

    for pair in qa_pairs:
        question = pair['question']
        encoded_input = tokenizer(question, return_tensors='pt', truncation=True, padding='max_length', max_length=128)
        with torch.no_grad():
            output = model(**encoded_input)
        embeddings[question] = output.last_hidden_state.mean(dim=1).squeeze().tolist()

    return embeddings

def main():
    input_path = sys.argv[1]
    try:
        with open(input_path, 'r') as file:
            qa_pairs = json.load(file)
        
        embeddings = generate_embeddings(qa_pairs)
        
        # Output the embeddings to stdout for the Node.js script to capture
        print(json.dumps(embeddings))
    
    except Exception as e:
        print(f"Error processing embeddings: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
