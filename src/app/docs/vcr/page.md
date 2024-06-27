---
title: VCR
nextjs:
  metadata:
    title: VCR
    description: Use VCR to record calls to AI APIs.
---

I advocate for the use of [VCR](https://github.com/vcr/vcr) to test against AI APIs. Although this can be some effort to set up and get used to, it allows you to:

- Test your code against the actual APIs, which is slow, and costs a little money, but is a snapshot of the real world.
- Just comment out your OpenAI API token to run your specs instantly against the recorded cassettes that exactly mirror the real API. This is free and as fast as a unit test.
- At any time rerun all specs again against the actual API and regenerate the responses that are automatically stored in your fixtures, to validate that your code will still work against the changing reality of the third-party API.

---

## Installation

First, install VCR & WebMock.

```ruby
# Gemfile
group :test do
  # Use VCR to record HTTP interactions and replay them.
  # https://github.com/vcr/vcr
  gem "vcr", "~> 6.2.0"

  # Use WebMock to stub HTTP requests.
  # https://github.com/bblimke/webmock
  gem "webmock", "~> 3.23.0"
end
```

## Setup

Configure VCR to ALWAYS record `:all` cassettes if the OPENAI_ACCESS_TOKEN is present, otherwise only record when a cassette is not present (`:new_episodes`).
Also redact your secret keys from the fixtures:

```ruby
require "vcr"
require "dotenv/load"

VCR.configure do |c|
  c.hook_into :webmock
  c.cassette_library_dir = "spec/fixtures/cassettes"
  # Record new episodes if the access token is present.
  c.default_cassette_options = {
    record: ENV.fetch("OPENAI_ACCESS_TOKEN", nil) ? :all : :new_episodes,
    match_requests_on: [:method, :uri]
  }
  c.filter_sensitive_data("<OPENAI_ACCESS_TOKEN>") { ENV["OPENAI_ACCESS_TOKEN"] }
  c.filter_sensitive_data("<OPENAI_ORGANIZATION_ID>") { ENV["OPENAI_ORGANIZATION_ID"] }
end
```

## Config

When no actual token is present, a fallback `dummy-token` is needed for tests to prevent `ruby-openai` raising an error . It will then hit recorded VCR cassettes and get the recorded response back.

```ruby
# config/initializers/openai.rb
OpenAI.configure do |config|
  config.access_token = ENV.fetch("OPENAI_ACCESS_TOKEN", Rails.env.test? ? "dummy-token" : nil)
  config.organization_id = ENV.fetch("OPENAI_ORGANIZATION_ID", nil)
end
```

## Usage

[Click here to view in AI Engine Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/spec/requests/messages_spec.rb)

### 1 cassette per request

It's best to use 1 cassette for 1 API request, and not reuse them in different tests unless you know exactly what you're doing. Give the cassettes explanatory names, and wrap the code that will trigger the API call in a VCR block like `VCR.use_cassette("unique_cassette_name") do`, for example:

```ruby
require "rails_helper"

RSpec.describe MessagesController, type: :request do
  let(:current_user) { create(:user) }

  before do
    sign_in current_user
  end

  describe "POST /create" do
    context "with valid parameters" do
      context "with a chat" do
        let(:chat) { current_user.chats.create }
        let(:model) { AI::Engine::MODEL_OPTIONS.sample }
        let(:valid_attributes) { {chat_id: chat.id, content: "Hi there", model: model} }

        it "creates a new Message" do
          # Sends the message history off to OpenAI and gets the response.
          VCR.use_cassette("requests_chat_messages_create_and_run") do
            expect {
              post messages_url, as: :turbo_stream, params: {message: valid_attributes}
            }.to change(chat.messages, :count).by(2)
          end

          expect(chat.messages.count).to eq(2)
          response = chat.messages.last
          expect(response.content).to be_present
          expect(response.model).to eq(model)
          expect(response.remote_id).to eq(nil)
        end
      end
    end
  end
end
```

Streaming data can then be seen in the fixture file, 3 chunks building the sentence "Hello!":

```
data: {"id":"chatcmpl-9eewU9DFnKgTFs6eSjFgMye4q6RL0","object":"chat.completion.chunk","created":1719477530,"model":"gpt-4-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}],"usage":null}

data: {"id":"chatcmpl-9eewU9DFnKgTFs6eSjFgMye4q6RL0","object":"chat.completion.chunk","created":1719477530,"model":"gpt-4-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}],"usage":null}

data: {"id":"chatcmpl-9eewU9DFnKgTFs6eSjFgMye4q6RL0","object":"chat.completion.chunk","created":1719477530,"model":"gpt-4-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"!"},"logprobs":null,"finish_reason":null}],"usage":null}
```

### Expect non-determinism

I generally don't test the content of the AI response, since this naturally can change a lot based on how LLMs work. Instead just check that SOME text (or image, file etc.) was returned. Specs like this are useful to check the thing that usually breaks, ie. your integration with the API (since it can be broken at either end).

## Workflows

### Initial recording of cassettes

- Go to .env file and uncomment `OPENAI_ACCESS_TOKEN=123abc...`
- Run specs with `bundle exec rspec`, which will record new cassettes
- Go to .env file and comment out `# OPENAI_ACCESS_TOKEN=123abc...`
- Run specs with `bundle exec rspec`, which will use the recorded cassettes
- Ensure the fixtures are committed to source control so they can be used by others and in Continuous Integration, and to spot any changes

### Debugging

- To debug, you can examine the fixtures to see exactly what the LLM API has returned, even when streaming
- Use source control to see exactly what's changed in the fixtures
- Delete a fixture and rerun the spec to get a refreshed API response

### Resetting/cleaning up

- At any time you can delete all the fixtures in `spec/fixtures/cassettes`
- Go to .env file and uncomment `OPENAI_ACCESS_TOKEN=123abc...`
- Run specs with `bundle exec rspec`, which will record new cassettes

## Gotchas

### Leaking Secrets

[Click here to view example in AI Engine Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/spec/fixtures/cassettes/requests_chat_messages_create_and_run.yml)

Ensure your OPENAI_ACCESS_TOKEN is correctly redacted from fixtures when you first set it up. This might not happen if you haven't correctly set up VCR or the `OPENAI_ACCESS_TOKEN` ENV var is not available in `spec_helper.rb` for some reason. When set up correctly, references to the token in fixtures should look something like:

```yml
headers:
  Content-Type:
    - application/json
  Authorization:
    - Bearer <OPENAI_ACCESS_TOKEN>
  Openai-Organization:
    - '<OPENAI_ORGANIZATION_ID>'
```

### Endless cassettes

Some slight changes to specs can cause VCR to append requests to cassette files instead of replacing their contents. These can stack up but shouldn't cause any problems, and the fix is to just delete the cassette and rerun against the API to get a clean cassette, that only contains 1 request & response.

## Support

Any issues, please email me at `hello@alexrudall.com` and I'll respond ASAP.
