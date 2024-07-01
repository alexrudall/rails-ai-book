---
title: Chattable
nextjs:
  metadata:
    title: Chattable
    description: Add OpenAI Chat to your Rails app.
---

This guide will walk you through adding a ChatGPT-like messaging stream to your Rails app using [AI::Engine](https://insertrobot.com).

The guide includes the backend integration with AI::Engine, controllers and views to create Chats and Messages, and various helpers to allow streaming of responses. The gem keeps track of the tokens used to create each message, and calculates the cost, which can be seen in the UI below.

![chattable-ui](/images/ai-engine/chattable/chattable-ui.png)

---

## Installation

First, install AI::Engine - [guide here](/docs/installation).

## Data Model

[Click here to view Data Model diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page)

AI::Engine includes a `Chattable` module, the `AI::Engine::Chat` and `AI::Engine::Message` classes and migrations to add these to your database.

The relations between these models and the methods added can be viewed in [this diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page). Red indicates code that will be added to your app via `include Chattable`, and blue code that is in the AI::Engine gem. Yellow text indicates relations between models in your app and models in AI::Engine.

## Integration

### Include Chattable

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/models/user.rb)

Add the Chattable module to the model that Chats will `belong_to` - probably the `User` model or similar.

```ruby
# app/models/user.rb
class User < ApplicationRecord
  include AI::Engine::Chattable
  ...
```

This adds a new `has_many` relation, so you can call `User.chats` and get a list of all `AI::Engine::Chats` belonging to a user.

It also adds 2 new callback methods, `ai_engine_on_message_create` and `ai_engine_on_message_update`, which are called by AI::Engine whenever a new message belonging to the User (or whichever model includes Chattable) is created or updated. They can be used, for example, like this to broadcast changes over Hotwire:

```ruby
  def ai_engine_on_message_create(message:)
    broadcast_ai_response(message:)
  end

  def ai_engine_on_message_update(message:)
    broadcast_ai_response(message:)
  end

  def broadcast_ai_response(message:)
    broadcast_append_to(
      "#{dom_id(message.messageable)}_messages",
      partial: "messages/message",
      locals: {message: message, scroll_to: true},
      target: "#{dom_id(message.messageable)}_messages"
    )
  end
```

### Create Message & Stream

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/jobs/create_chat_message_and_stream.rb)

Next we need a way to create messages and get a response from OpenAI. Generally it's recommended to do this in a background job, so that you can stream incremental updates for the best user experience. Here's an example:

```ruby
# app/jobs/create_chat_message_and_stream.rb
class CreateChatMessageAndStream < SidekiqJob
  def perform(args)
    chat_id, user_id, content, model = args.values_at("chat_id", "user_id", "content", "model")

    # Find the user.
    user = User.find(user_id)

    # Find the chat.
    chat = user.chats.find(chat_id)

    # Create the new user message.
    chat.messages.create(content: content, role: "user")

    # Get the response from OpenAI.
    chat.run(model: model)
  end
end
```

`Chat#run` will create a response message with `role: "assistant"` and stream updates from OpenAI to it, triggering `User#ai_engine_on_message_create` and `User#ai_engine_on_message_update`, the latter once per chunk as it's received.

## User Interface [Optional]

That's the integration complete! The rest of this guide is optional and dependent on your app - it just represents 1 simple way to build a user interface for AI::Engine Chat.

### Gemfile

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/Gemfile)

We're using these gems:

```ruby
# Gemfile
# Hotwire's SPA-like page accelerator
# https://turbo.hotwired.dev
gem "turbo-rails"

# Hotwire's modest JavaScript framework
# https://stimulus.hotwired.dev
gem "stimulus-rails"

# Use Tailwind CSS
# https://github.com/rails/tailwindcss-rails
gem "tailwindcss-rails"

# The safe Markdown parser.
# https://github.com/vmg/redcarpet
gem "redcarpet", "~> 3.6"
```

### Routes

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/config/routes.rb)

Add the routes:

```ruby
# config/routes.rb
Rails.application.routes.draw do
  resources :chats
  resources :messages
  ...
```

### Helpers

This global helper method uses the Redcarpet gem to handle any markdown received from the LLM:

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/helpers/application_helper.rb)

```ruby
# app/helpers/application_helper.rb
module ApplicationHelper
  DEFAULT_MARKDOWN_EXTENSIONS = {
    autolink: true,
    fenced_code_blocks: true,
    filter_html: true,
    highlight: true,
    no_intra_emphasis: true,
    prettify: true,
    underline: true
  }.freeze
  def markdown(content, extensions = {})
    extensions = DEFAULT_MARKDOWN_EXTENSIONS.merge(extensions)
    renderer = Redcarpet::Markdown.new(Redcarpet::Render::HTML, extensions)
    renderer.render(content).html_safe
  end
end
```

A couple of helpers for Messages:

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/helpers/messages_helper.rb)

```ruby
# app/helpers/messages_helper.rb
module MessagesHelper
  def created_by(message:)
    return message.user.full_name if message.user?

    return message.model if message.in_chat?
  end

  def message_model_options(selected_model: nil)
    options_for_select(
      AI::Engine::MODEL_OPTIONS,
      selected: selected_model
    )
  end
end

```

### ChatsController

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/controllers/chats_controller.rb)

Here's a simple controller to create `AI::Engine::Chats`. We set `@selected_model` so that different models can be chosen per response, and the model used in the previous message will be the default for the select:

```ruby
# app/controllers/chats_controller.rb
class ChatsController < ApplicationController
  before_action :set_chat, only: %i[show edit update destroy]

  # GET /chats or /chats.json
  def index
    @chats = current_user.chats.all.order(created_at: :desc)
  end

  # GET /chats/1 or /chats/1.json
  def show
    @selected_model = @chat.messages.order(:created_at).last&.model
  end

  # GET /chats/new
  def new
    @chat = current_user.chats.new
  end

  # GET /chats/1/edit
  def edit
  end

  # POST /chats or /chats.json
  def create
    @chat = current_user.chats.new

    respond_to do |format|
      if @chat.save
        format.html { redirect_to chat_url(@chat), notice: "Chat was successfully created." }
      else
        format.html { render :new, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /chats/1 or /chats/1.json
  def update
    respond_to do |format|
      if @chat.save
        format.html { redirect_to chat_url(@chat), notice: "Chat was successfully updated." }
      else
        format.html { render :edit, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /chats/1 or /chats/1.json
  def destroy
    @chat.destroy!

    respond_to do |format|
      format.html { redirect_to chats_url, notice: "Chat was successfully destroyed." }
    end
  end

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_chat
    @chat = current_user.chats.find(params[:id])
  end
end
```

### Chats views

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/tree/main/app/views/chats)

Simple views for Chat CRUD:

app/views/chats/\_chat.html.erb

```erb
<div id="<%= dom_id chat %>">
  <p class="my-5">
    <%= "Created #{chat.created_at.to_formatted_s(:short)}" %>
  </p>

  <% if action_name != "show" %>
    <%= link_to "Show this chat", chat, class: "rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
    <%= link_to "Edit this chat", edit_chat_path(chat), class: "rounded-lg py-3 ml-2 px-5 bg-gray-100 inline-block font-medium" %>
    <hr class="mt-6">
  <% end %>
</div>
```

app/views/chats/\_form.html.erb

```erb
<%= form_with(model: chat, class: "contents") do |form| %>
  <% if chat.errors.any? %>
    <div id="error_explanation" class="bg-red-50 text-red-500 px-3 py-2 font-medium rounded-lg mt-3">
      <h2><%= pluralize(chat.errors.count, "error") %> prohibited this chat from being saved:</h2>

      <ul>
        <% chat.errors.each do |error| %>
          <li><%= error.full_message %></li>
        <% end %>
      </ul>
    </div>
  <% end %>

  <div class="inline">
    <%= form.submit class: "rounded-lg py-3 px-5 bg-red-600 text-white inline-block font-medium cursor-pointer" %>
  </div>
<% end %>
```

app/views/chats/edit.html.erb

```erb
<div class="mx-auto md:w-2/3 w-full">
  <h1 class="font-bold text-4xl">Editing chat</h1>

  <%= render "form", chat: @chat %>

  <%= link_to "Show this chat", @chat, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
  <%= link_to "Back to chats", chats_path, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
</div>
```

app/views/chats/index.html.erb

```erb
<div class="w-full">
  <% if notice.present? %>
    <p class="py-2 px-3 bg-green-50 mb-5 text-green-500 font-medium rounded-lg inline-block" id="notice"><%= notice %></p>
  <% end %>

  <div class="flex justify-between items-center">
    <h1 class="font-bold text-4xl">Chats</h1>
    <%= link_to "New chat", new_chat_path, class: "rounded-lg py-3 px-5 bg-red-600 text-white block font-medium" %>
  </div>

  <div id="chats" class="min-w-full">
    <%= render @chats %>
  </div>
</div>
```

app/views/chats/new.html.erb

```erb
<div class="mx-auto md:w-2/3 w-full space-y-8">
  <h1 class="font-bold text-4xl">New chat</h1>

  <%= render "form", chat: @chat %>

  <%= link_to "Back to chats", chats_path, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
</div>
```

app/views/chats/show.html.erb

```erb
<div class="mx-auto md:w-2/3 w-full flex">
  <div class="mx-auto">
    <% if notice.present? %>
      <p class="py-2 px-3 bg-green-50 mb-5 text-green-500 font-medium rounded-lg inline-block" id="notice"><%= notice %></p>
    <% end %>

    <div class="bg-white py-8">
      <div class="mx-auto px-6 ">
        <ul role="list" class="overflow-y-auto max-h-[48vh] flex flex-col-reverse">
          <%= turbo_stream_from "#{dom_id(@chat)}_messages" %>
          <div id="<%= dom_id(@chat) %>_messages">
            <%= render @chat.messages.order(:created_at) %>
          </div>
        </ul>

        <%= render partial: "messages/form", locals: { messageable: @chat, selected_model: @selected_model } %>
      </div>
    </div>

    <%= link_to "Edit this chat", edit_chat_path(@chat), class: "mt-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
    <div class="inline-block ml-2">
      <%= button_to "Destroy this chat", chat_path(@chat), method: :delete, class: "mt-2 rounded-lg py-3 px-5 bg-gray-100 font-medium" %>
    </div>
    <%= link_to "Back to chats", chats_path, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
  </div>
</div>
```

### Messages controller

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/controllers/messages_controller.rb)

For the messages controller, we just need a single async endpoint to create new user messages using our job:

```ruby
# app/controllers/messages_controller.rb
class MessagesController < ApplicationController
  def create
    CreateChatMessageAndStream.perform_async(
      "chat_id" => message_params[:chat_id],
      "content" => message_params[:content],
      "model" => message_params[:model],
      "user_id" => current_user.id
    )

    head :ok
  end

  private

  def message_params
    params.require(:message).permit(:chat_id, :content, :model)
  end
end
```

### Messages views

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/tree/main/app/views/messages)

We need partials to create and show the messages:

app/views/messages/\_form.html.erb

```erb
<%= turbo_frame_tag "#{dom_id(messageable)}_message_form" do %>
  <%= form_with(model: AI::Engine::Message.new, url: [messageable.messages.new], data: {
      controller: "reset-form submit-form-on-enter",
      action: "turbo:submit-start->reset-form#reset keydown.enter->submit-form-on-enter#submit:prevent"
    }) do |form| %>
    <div class="my-5">
      <%= form.text_area :content, rows: 4, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full focus:border-red-600 focus:ring-red-600", autofocus: true, "data-reset-form-target" => "content" %>
    </div>

    <div class="flex justify-items-end">
      <% if messageable.is_a?(AI::Engine::Chat) %>
        <div class="mr-auto">
          <%= form.label :model, "Model:" %>
          <%= form.select :model, message_model_options(selected_model: selected_model), class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full" %>
        </div>

        <%= form.hidden_field :chat_id, value: messageable.id %>
      <% else %>
        <div class="mr-auto">
          <%= form.label :storyteller_id, "Storyteller:" %>
          <%= form.select :storyteller_id, message_storyteller_options(assistant_thread: messageable, selected_storyteller_id: selected_storyteller_id), class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full" %>
        </div>

        <%= form.hidden_field :assistant_thread_id, value: messageable.id %>
      <% end %>

      <%= form.button type: :submit, class: "rounded-lg py-3 px-5 bg-red-600 text-white inline-block font-medium cursor-pointer" do %>
        <i class="fas fa-paper-plane"></i>
        <span class="pl-2">Send</span>
      <% end %>
    </div>
  <% end %>
<% end %>

```

app/views/messages/\_message.html.erb

```erb
<% if defined?(scroll_to) && scroll_to %>
  <li id="<%= dom_id message %>" class="py-4" x-init="$el.scrollIntoView({ behavior: 'smooth' })">
<% else %>
  <li id="<%= dom_id message %>" class="py-4">
<% end %>
  <div class="flex items-center gap-x-3">
    <% if message.user? %>
      <% user = message.user %>
      <%= image_tag(user.avatar_url, class: "h-6 w-6 flex-none rounded-full bg-gray-800") %>
      <h3 class="flex-auto truncate font-semibold leading-6 text-gray-900"><%= created_by(message: message) %></h3>
    <% else %>
      <h3 class="flex-none truncate font-semibold leading-6 text-gray-900"><%= created_by(message: message) %></h3>
      <div class="flex-auto text-sm text-gray-500"><%= message.prompt_token_usage %> input tokens [$<%= message.input_cost %>] / <%= message.completion_token_usage %> output tokens [$<%= message.output_cost %>]</div>
    <% end %>
    <div class="flex-none text-sm text-gray-500"><%= time_ago_in_words(message.created_at) %> ago</div>
  </div>
  <p class="mt-3 text-gray-900"><%= markdown(message.content) %></p>
</li>
```

### Messages JS

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/tree/main/app/javascript/controllers)

We also need a couple of Stimulus JS controllers to submit the form when Enter is pressed:

```js
// app/javascript/controllers/submit_form_on_enter_controller.js
import { Controller } from '@hotwired/stimulus'

export default class extends Controller {
  submit(event) {
    event.currentTarget.requestSubmit()
  }
}
```

And to reset the input box on submit:

```js
// app/javascript/controllers/reset_form_controller.js
import { Controller } from '@hotwired/stimulus'

export default class extends Controller {
  static targets = ['content']

  reset() {
    this.element.reset()
    this.contentTarget.value = ''
  }
}
```

## Specs [Optional]

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/spec/requests/messages_spec.rb)

[Click here to see how I set up VCR for verifying AI integrations](/docs/vcr)

Finally, here's a request spec using VCR to check the messages endpoint hits OpenAI and streams the result. It checks that 2 messages are created, one for the user message and one for the LLM response.

```ruby
# spec/requests/messages_spec.rb
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

## Use

In your app you should now be able to create a new Chat, go to its show page and create and receive messages from the LLM!

## Limitations

There is a limitation of this approach: each time you send a message it will also send the entire message history of this Chat to the LLM. In order to get around this limitation, we can use the [Assistants API](/docs/assistable).

## Support

Any issues, please email me at `hello@alexrudall.com` and I'll respond ASAP.
