from seed import seed_database

if __name__ == "__main__":
    print("[+] Running Database Reset...")
    seed_database(reset=True)
