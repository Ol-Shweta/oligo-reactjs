import sys
import json
import spacy
import torch
from transformers import BertTokenizer, BertModel

# Load spaCy model for Named Entity Recognition (NER)
nlp = spacy.load("en_core_web_md")  # You can change this to "en_core_web_sm" or "en_core_web_lg" based on your needs

def generate_embeddings(qa_pairs):
    """
    Generate embeddings for each question using the BERT model.
    Returns a dictionary with questions as keys and their embeddings as values.
    """
    tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    model = BertModel.from_pretrained('bert-base-uncased')

    embeddings = {}

    for pair in qa_pairs:
        question = pair.get('question', "")
        if not question:
            print(f"Warning: Empty question found, skipping.")
            continue

        # Tokenize the question
        encoded_input = tokenizer(question, return_tensors='pt', truncation=True, padding='max_length', max_length=128)
        with torch.no_grad():
            output = model(**encoded_input)

        # Take the mean of the hidden states as the embedding
        embeddings[question] = output.last_hidden_state.mean(dim=1).squeeze().tolist()

    return embeddings

def extract_entities(text):
    """
    Extract named entities from text using spaCy NER.
    Returns a list of tuples containing entity text and label.
    """
    doc = nlp(text)
    entities = [(ent.text, ent.label_) for ent in doc.ents]
    
    # Print out the detected entities for debugging
    print(f"Entities found in text: '{text}': {entities}")
    
    return entities

def main():
    if len(sys.argv) < 2:
        print("Usage: python bert_embeddings.py <path_to_input_file>")
        sys.exit(1)

    input_path = sys.argv[1]
    
    try:
        # Read the raw content from the file for debugging purposes
        with open(input_path, 'r', encoding='utf-8') as file:
            content = file.read().strip()  # Strip any leading/trailing whitespace or BOM
            print(f"Raw input content (first 500 characters): {content[:500]}")  # Print the first 500 characters for inspection
            
            # Try to load the content as JSON
            qa_pairs = json.loads(content)
        
        print("Successfully loaded input JSON.")

        # Generate embeddings for questions
        embeddings = generate_embeddings(qa_pairs)
        print("Embeddings generated.")

        # Extract entities from both questions and answers
        for pair in qa_pairs:
            question = pair.get('question', "")
            answer = pair.get('answer', "")
            pair['question_entities'] = extract_entities(question)
            pair['answer_entities'] = extract_entities(answer)
            pair['embedding'] = embeddings[question]  # Add embeddings to the pair

        # Save the output to qaEmbeddings.json
        with open('qaEmbeddings.json', 'w', encoding='utf-8') as output_file:
            json.dump(qa_pairs, output_file, indent=2)
        
        print("Embeddings and entities saved to qaEmbeddings.json.")

    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from file {input_path}: {e}", file=sys.stderr)
    except FileNotFoundError as e:
        print(f"File not found: {input_path}", file=sys.stderr)
    except Exception as e:
        print(f"Error processing embeddings or saving model: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
