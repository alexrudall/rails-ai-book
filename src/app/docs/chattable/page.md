---
title: Streaming Chat
nextjs:
  metadata:
    title: Streaming Chat
    description: Add a messaging stream.
---

This guide will walk you through adding a ChatGPT-like messaging stream to your Ruby on Rails 7 app using ruby-openai, Rails 7, Hotwire, Turbostream, Sidekiq and Tailwind. It's based on [this gist](https://gist.github.com/alexrudall/cb5ee1e109353ef358adb4e66631799d).

---

## Setup

### Gemfile

First, add the ruby-openai gem! It needs to be at least version 4. Add Sidekiq too if you don't have it.

```ruby
# Gemfile
# https://github.com/alexrudall/ruby-openai
gem "ruby-openai", "~> 7.0.1"

# Simple, efficient background processing using Redis.
# https://github.com/sidekiq/sidekiq
gem "sidekiq", "~> 7.2.4"
```

### Background Jobs

Install Redis on your machine:

```bash
brew install redis
```

Add Redis and Sidekiq to your Procfile so they run when you run bin/dev.

```bash
# Procfile.dev
web: bin/rails server -p 3000
css: bin/rails tailwindcss:watch
sidekiq: bundle exec sidekiq -c 2
queue: redis-server
```

### Token

Add your secret OpenAI token to your .env file. Get one from OpenAI [here](https://platform.openai.com/api-keys).

```bash
OPENAI_ACCESS_TOKEN=abc123
```

## Models

### Migrations

Generate the migrations:

```bash
bin/rails generate migration CreateChats user:references
bin/rails generate migration CreateMessages chat:references role:integer content:string
```

The chat migration should look like:

```ruby
# db/migrate/20230427131800_create_chats.rb
# bin/rails generate migration CreateChats user:references
class CreateChats < ActiveRecord::Migration[7.0]
  def change
    create_table :chats do |t|
      t.references :user, null: false, foreign_key: true

      t.timestamps
    end
  end
end
```

The messages migration:

```ruby
# db/migrate/20230427131900_create_messages.rb
# bin/rails generate migration CreateMessages chat:references role:integer content:string
class CreateMessages < ActiveRecord::Migration[7.0]
  def change
    create_table :messages do |t|
      t.references :chat, foreign_key: true
      t.integer :role, null: false, default: 0
      t.string :content, null: false
      t.integer :response_number, null: false, default: 0

      t.timestamps
    end
  end
end
```

### Chat

Add the Chat model:

```ruby
# app/models/chat.rb
class Chat < ApplicationRecord
  belongs_to :user
  has_many :messages, dependent: :destroy
end
```

### Message

and the Message model:

```ruby
# app/models/message.rb
class Message < ApplicationRecord
  include ActionView::RecordIdentifier

  enum role: { system: 0, assistant: 10, user: 20 }

  belongs_to :chat

  after_create_commit -> { broadcast_created }
  after_update_commit -> { broadcast_updated }

  def broadcast_created
    broadcast_append_later_to(
      "#{dom_id(chat)}_messages",
      partial: "messages/message",
      locals: { message: self, scroll_to: true },
      target: "#{dom_id(chat)}_messages"
    )
  end

  def broadcast_updated
    broadcast_append_to(
      "#{dom_id(chat)}_messages",
      partial: "messages/message",
      locals: { message: self, scroll_to: true },
      target: "#{dom_id(chat)}_messages"
    )
  end

  def self.for_openai(messages)
    messages.map { |message| { role: message.role, content: message.content } }
  end
end
```

## Controllers

Add the new routes:

```ruby
# config/routes.rb
resources :chats, only: %i[create show] do
  resources :messages, only: %i[create]
end
```

### Chats

Add the Chat controller:

```ruby
# app/controllers/chats_controller.rb
class ChatsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_chat, only: %i[show]

  def show
    respond_with(@chat)
  end

  def create
    @chat = Chat.create(user: current_user)
    respond_with(@chat)
  end

  private

  def set_chat
    @chat = Chat.find(params[:id])
  end
end
```

### Messages

and the Messages controller:

```ruby
# app/controllers/messages_controller.rb
class MessagesController < ApplicationController
  include ActionView::RecordIdentifier

  before_action :authenticate_user!

  def create
    @message = Message.create(message_params.merge(chat_id: params[:chat_id], role: "user"))

    GetAiResponse.perform_async(@message.chat_id)

    respond_to do |format|
      format.turbo_stream
    end
  end

  private

  def message_params
    params.require(:message).permit(:content)
  end
end
```

## AI

### Job

Add the AI job, which will run in the background, hit the OpenAI API, and broadcast changes to the frontend via Hotwire:

```ruby
# app/jobs/get_ai_response.rb
class GetAiResponse < SidekiqJob
  RESPONSES_PER_MESSAGE = 1

  def perform(chat_id)
    chat = Chat.find(chat_id)
    call_openai(chat: chat)
  end

  private

  def call_openai(chat:)
    OpenAI::Client.new.chat(
      parameters: {
        model: "gpt-3.5-turbo",
        messages: Message.for_openai(chat.messages),
        temperature: 0.8,
        stream: stream_proc(chat: chat),
        n: RESPONSES_PER_MESSAGE
      }
    )
  end

  def create_messages(chat:)
    messages = []
    RESPONSES_PER_MESSAGE.times do |i|
      message = chat.messages.create(role: "assistant", content: "", response_number: i)
      message.broadcast_created
      messages << message
    end
    messages
  end

  def stream_proc(chat:)
    messages = create_messages(chat: chat)
    proc do |chunk, _bytesize|
      new_content = chunk.dig("choices", 0, "delta", "content")
      message = messages.find { |m| m.response_number == chunk.dig("choices", 0, "index") }
      message.update(content: message.content + new_content) if new_content
    end
  end
end
```

## Views

### Chat

Finally, let's wire up our views:

```ruby
# app/views/chats/show.html.erb
<div class="mx-auto w-full flex">
  <div class="mx-auto">

    <div class="bg-white py-8">
      <div class="mx-auto max-w-lg px-6 ">
        <ul role="list" class="overflow-y-auto max-h-[48vh] flex flex-col-reverse">
          <%= turbo_stream_from "#{dom_id(@chat)}_messages" %>
          <div id="<%= dom_id(@chat) %>_messages">
            <%= render @chat.messages %>
          </div>
        </ul>

        <%= render partial: "messages/form", locals: { chat: @chat } %>
      </div>
    </div>

  </div>
</div>
```

### Turbo Stream

This turbo stream updates the frontend on changes:

```ruby
# app/views/messages/create.turbo_stream.erb
<%= turbo_stream.append "#{dom_id(@message.chat)}_messages" do %>
  <%= render "message", message: @message, scroll_to: true %>
<% end %>
<%= turbo_stream.replace "#{dom_id(@message.chat)}_message_form" do %>
  <%= render "form", chat: @message.chat %>
<% end %>
```

### Message Form

This form is where users can enter their messages. It'll clear the form after submit as well.

```ruby
# app/views/messages/_form.html.erb
<%= turbo_frame_tag "#{dom_id(chat)}_message_form" do %>
  <%= form_with(model: Message.new, url: [chat, chat.messages.new]) do |form| %>
    <div class="my-5">
      <%= form.text_area :content, rows: 4, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full", autofocus: true, "x-on:keydown.cmd.enter" => "$event.target.form.requestSubmit();" %>
    </div>

    <div class="grid justify-items-end">
      <%= form.button type: :submit, class: "rounded-lg py-3 px-5 bg-blue-600 text-white inline-block font-medium cursor-pointer" do %>
        <i class="fas fa-paper-plane"></i>
        <span class="pl-2">Send</span>
      <% end %>
    </div>
  <% end %>
<% end %>
```

### Message Partial

The message partial renders the message content, styled differently depending on whether the message comes from a user or from AI.

```ruby
# app/views/messages/_message.html.erb
# Thanks to github.com/fanahova for this template!
<div id="<%= dom_id(message) %>_messages">
  <% if message.user? %>
    <div class="bg-sky-400 rounded-lg m-8 text-white p-4">
      <%= message.content %>
    </div>
  <% else %>
    <div class="bg-gray-200 rounded-lg m-8 p-4">
      <%= message.content %>
    </div>
  <% end %>
</div>
```
