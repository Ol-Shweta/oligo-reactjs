import sys
import json
import spacy
import torch
from transformers import BertTokenizer, BertModel

# Load spaCy model for Named Entity Recognition (NER)
# nlp = spacy.load("en_core_web_sm")
nlp = spacy.load("en_core_web_md")  # Or "en_core_web_lg"


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

def extract_entities(text):
    """
    Extract named entities from a text using spaCy.
    This will return a list of entities with their labels.
    """
    doc = nlp(text)
    entities = [(ent.text, ent.label_) for ent in doc.ents]
    
    # Print detected entities for debugging
    print(f"Entities found in '{text}': {entities}")
    
    return entities


def main():
    input_path = sys.argv[1]
    try:
        with open(input_path, 'r') as file:
            qa_pairs = json.load(file)
        
        embeddings = generate_embeddings(qa_pairs)
        
        # Extract entities from both questions and answers
        for pair in qa_pairs:
            question = pair['question']
            answer = pair['answer']
            pair['question_entities'] = extract_entities(question)
            pair['answer_entities'] = extract_entities(answer)

        # Output the embeddings and entities to stdout for the Node.js script to capture
        print(json.dumps(qa_pairs))
    
    except Exception as e:
        print(f"Error processing embeddings: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
