---
title: Assistable
nextjs:
  metadata:
    title: Assistable
    description: Add OpenAI Assistants to your Rails app.
---

This guide will walk you through adding streaming AI Assistants to your Rails app using [AI::Engine](https://insertrobot.com).

The guide includes the backend integration with AI::Engine, controllers and views to create Assistants, Threads, Runs and Messages, and various helpers to allow streaming of responses. It includes an abstraction called Storyteller, which is a model in your app that owns an assistant - Storyteller could instead be called anything you want, any _type of assistant_, eg. BusinessStrategy, RecipeMaker, etc.

![assistable-ui](/images/ai-engine/assistable/assistable-ui.png)

---

## Installation

First, install AI::Engine - [guide here](/docs/installation).

---

## Data Model

[Click here to view Data Model diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page)

OpenAI Assistants consist of 4 concepts: Assistants, Threads, Runs and Messages. Assistants store the AI model, and any supporting files and data. Threads represent a set of Messages. Messages can be added by the user to Threads.

Then, at any point, a Run can be created, which requires 1 Assistant and 1 Thread. The Run will then pass all the Messages in the given Thread to the given Assistant, which will then take a summary of all the messages so far, and generate a response using its model. The response can be streamed.

To mirror this in your Rails app, AI::Engine includes a `Assistable` module, the `AI::Engine::Assistant`, `AI::Engine::AssistantThread`, `AI::Engine::Run` and `AI::Engine::Message` classes and migrations to add these to your database. They're called `AI::Engine::AssistantThreads` rather than `AI::Engine::Threads` because `Thread` is an important protected word in Ruby.

The relations between these models and the methods added can be viewed in [this diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page). Red indicates code that will be added to your app via `include Assistable` and `include Threadable`, and blue code that is in the AI::Engine gem. Yellow text indicates relations between models in your app and models in AI::Engine.

## Integration

### Include Assistable

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/models/storyteller.rb)

Add the Assistable module to the model that an Assistant will `belong_to` - in this example the `Storyteller` model, in your app it could be anything, eg. a BusinessStrategy or a SpaghettiRecipeMaker.

```ruby
# app/models/storyteller.rb
class Storyteller < ApplicationRecord
  include AI::Engine::Assistable
  ...
```

This adds a new `has_one` relation, so you can call `Storyteller#assistant` and get the `AI::Engine::Assistant` belonging to the model. It adds `before_create :create_openai_assistant` and `before_update :update_openai_assistant` callbacks, so the corresponding `AI::Engine::Assistant` and the Assistant on OpenAI's API will be created and updated to match the Storyteller.

It adds a method, `ai_engine_assistant`, which can be overridden in your Assistable model - eg., Storyteller - to define the Assistant. For example, this Storyteller definition takes the Assistant parameters from the Storyteller.

```ruby
  class Storyteller < ApplicationRecord
    include AI::Engine::Assistable

    def ai_engine_assistant
      {
        name: name,
        model: model,
        description: name,
        instructions: instructions
      }
    end
  end
```

It also adds a method, `ai_engine_run`, which takes an `assistant_thread` and `content` as params, creates an `AI::Engine::Message` with the user content and runs an `AI::Engine::Run` to get the AI response from the API. The response will be added to a second `AI::Engine::Message` which can be streamed to the UI.

### Include Threadable

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/models/user.rb)

We also need a way to create and manage Threads and receive messages from OpenAI.

Add the Threadable module to the model that Threads will `belong_to` - probably a `User` or `Team` model.

```ruby
# app/models/user.rb
class User < ApplicationRecord
  include AI::Engine::Threadable
  ...
```

This adds a new `has_many` relation, so you can call `User#assistant_threads` and get the `AI::Engine::AssistantThreads` belonging to the model.

It also adds 2 new callback methods, `ai_engine_on_message_create` and `ai_engine_on_message_update`, which are called by AI::Engine whenever a new message on an AssistantThread belonging to the User (or whichever model includes Threadable) is created or updated. They can be used, for example, like this to broadcast changes over Hotwire:

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

### Create Message & Run

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/jobs/create_assistant_message_and_run.rb)

Next we need a way to create messages and get a response from OpenAI. Generally it's recommended to do this in a background job, so that you can stream incremental updates for the best user experience. Here's an example:

```ruby
# app/jobs/create_assistant_message_and_run.rb
class CreateAssistantMessageAndRun < SidekiqJob
  def perform(args)
    storyteller_id, assistant_thread_id, user_id, content = args.values_at("storyteller_id", "assistant_thread_id", "user_id", "content")

    user = User.find(user_id)

    assistant_thread = user.assistant_threads.find(assistant_thread_id)
    storyteller = user.storytellers.find(storyteller_id)

    storyteller.ai_engine_run(assistant_thread: assistant_thread, content: content)
  end
end
```

`Storyteller#ai_engine_run` will create a response message with `role: "assistant"` and stream updates from OpenAI to it, triggering `User#ai_engine_on_message_create` and `User#ai_engine_on_message_update`, the latter once per chunk as it's received.

## User Interface [Optional]

That's the integration complete! The rest of this guide is optional and dependent on your app - it just represents 1 simple way to build a user interface for AI::Engine Assistants.

### Storyteller CRUD

We can now add a simple Storyteller resource. When created, each Storyteller will get a corresponding `AI::Engine::Assistant` created in the database, and a corresponding `Assistant` on the OpenAI API.

### Gemfile

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/Gemfile)

We're using these gems:

```ruby
# /Gemfile
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

Add these routes:

```ruby
# config/routes.rb
Rails.application.routes.draw do
  resources :storytellers
  ...
```

### StorytellersController

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/controllers/storytellers_controller.rb)

```ruby
class StorytellersController < ApplicationController
  before_action :set_storyteller, only: %i[show edit update destroy]

  # GET /storytellers or /storytellers.json
  def index
    @storytellers = Storyteller.all.order(created_at: :desc)
  end

  # GET /storytellers/1 or /storytellers/1.json
  def show
  end

  # GET /storytellers/new
  def new
    @storyteller = Storyteller.new
  end

  # GET /storytellers/1/edit
  def edit
  end

  # POST /storytellers or /storytellers.json
  def create
    @storyteller = current_user.storytellers.new(storyteller_params)

    respond_to do |format|
      if @storyteller.save
        format.html { redirect_to storyteller_url(@storyteller), notice: "Storyteller was successfully created." }
      else
        format.html { render :new, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /storytellers/1 or /storytellers/1.json
  def update
    respond_to do |format|
      if @storyteller.update(storyteller_params)
        format.html { redirect_to storyteller_url(@storyteller), notice: "Storyteller was successfully updated." }
      else
        format.html { render :edit, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /storytellers/1 or /storytellers/1.json
  def destroy
    @storyteller.destroy!

    respond_to do |format|
      format.html { redirect_to storytellers_url, notice: "Storyteller was successfully deleted." }
    end
  end

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_storyteller
    @storyteller = current_user.storytellers.find(params[:id])
  end

  # Only allow a list of trusted parameters through.
  def storyteller_params
    params.require(:storyteller).permit(:name, :model, :description, :instructions, :max_prompt_tokens, :max_completion_tokens)
  end
end

```

### Storytellers views

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/tree/main/app/views/storytellers)

Simple views for Storyteller CRUD:

app/views/storytellers/index.html.erb

```erb
<div class="w-full">
  <% if notice.present? %>
    <p class="py-2 px-3 bg-green-50 mb-5 text-green-500 font-medium rounded-lg inline-block" id="notice"><%= notice %></p>
  <% end %>

  <div class="flex justify-between items-center">
    <h1 class="font-bold text-4xl">Storytellers</h1>
    <%= link_to "New storyteller", new_storyteller_path, class: "rounded-lg py-3 px-5 bg-red-600 text-white block font-medium" %>
  </div>

  <div id="storytellers" class="min-w-full">
    <%= render @storytellers %>
  </div>
</div>
```

app/views/storytellers/\_storyteller.html.erb

```erb
<div id="<%= dom_id storyteller %>">
  <p class="my-5">
    <strong class="block font-medium mb-1">Name:</strong>
    <%= storyteller.name %>
  </p>

  <p class="my-5">
    <strong class="block font-medium mb-1">Model:</strong>
    <%= storyteller.model %>
  </p>

  <% if action_name != "show" %>
    <%= link_to "Show this storyteller", storyteller, class: "rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
    <%= link_to "Edit this storyteller", edit_storyteller_path(storyteller), class: "rounded-lg py-3 ml-2 px-5 bg-gray-100 inline-block font-medium" %>
    <hr class="mt-6">
  <% end %>
</div>
```

app/views/storytellers/new.html.erb

```erb
<div class="mx-auto md:w-2/3 w-full">
  <h1 class="font-bold text-4xl">New storyteller</h1>

  <%= render "form", storyteller: @storyteller %>

  <%= link_to "Back to storytellers", storytellers_path, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
</div>
```

app/views/storytellers/edit.html.erb

```erb
<div class="mx-auto md:w-2/3 w-full">
  <h1 class="font-bold text-4xl">Editing storyteller</h1>

  <%= render "form", storyteller: @storyteller %>

  <%= link_to "Show this storyteller", @storyteller, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
  <%= link_to "Back to storytellers", storytellers_path, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
</div>
```

app/views/storytellers/\_form.html.erb

```erb
<%= form_with(model: storyteller, class: "contents") do |form| %>
  <% if storyteller.errors.any? %>
    <div id="error_explanation" class="bg-red-50 text-red-500 px-3 py-2 font-medium rounded-lg mt-3">
      <h2><%= pluralize(storyteller.errors.count, "error") %> prohibited this storyteller from being saved:</h2>

      <ul>
        <% storyteller.errors.each do |error| %>
          <li><%= error.full_message %></li>
        <% end %>
      </ul>
    </div>
  <% end %>

  <div class="my-5">
    <%= form.label :name %>
    <%= form.text_field :name, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full focus:border-red-600 focus:ring-red-600", required: true %>
  </div>

  <div class="my-5">
    <%= form.label :model %>
    <%= form.select :model, model_options(storyteller: storyteller), {}, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full focus:border-red-600 focus:ring-red-600" %>
  </div>

  <div class="my-5">
    <%= form.label :description %>
    <%= form.text_field :description, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full focus:border-red-600 focus:ring-red-600", required: true %>
  </div>

  <div class="my-5">
    <%= form.label :instructions %>
    <%= form.text_area :instructions, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full focus:border-red-600 focus:ring-red-600", required: true %>
  </div>

  <div class="my-5">
    <%= form.label :max_prompt_tokens %>
    <%= form.number_field :max_prompt_tokens, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full focus:border-red-600 focus:ring-red-600", required: true, min: AI::Engine::Assistant::MIN_PROMPT_TOKENS %>
  </div>

  <div class="my-5">
    <%= form.label :max_completion_tokens %>
    <%= form.number_field :max_completion_tokens, class: "block shadow rounded-md border border-gray-200 outline-none px-3 py-2 mt-2 w-full focus:border-red-600 focus:ring-red-600", required: true, min: AI::Engine::Assistant::MIN_COMPLETION_TOKENS %>
  </div>

  <div class="inline">
    <%= form.submit class: "rounded-lg py-3 px-5 bg-red-600 text-white inline-block font-medium cursor-pointer" %>
  </div>
<% end %>

```

app/views/storytellers/show.html.erb

```erb
<div class="mx-auto md:w-2/3 w-full flex">
  <div class="mx-auto">
    <% if notice.present? %>
      <p class="py-2 px-3 bg-green-50 mb-5 text-green-500 font-medium rounded-lg inline-block" id="notice"><%= notice %></p>
    <% end %>

    <%= render @storyteller %>

    <%= link_to "Edit this storyteller", edit_storyteller_path(@storyteller), class: "mt-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
    <div class="inline-block ml-2">
      <%= button_to "Destroy this storyteller", storyteller_path(@storyteller), method: :delete, class: "mt-2 rounded-lg py-3 px-5 bg-gray-100 font-medium" %>
    </div>
    <%= link_to "Back to storytellers", storytellers_path, class: "ml-2 rounded-lg py-3 px-5 bg-gray-100 inline-block font-medium" %>
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
    CreateAssistantMessageAndRun.perform_async(
      "assistant_thread_id" => message_params[:assistant_thread_id],
      "storyteller_id" => message_params[:storyteller_id],
      "content" => message_params[:content],
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
      context "with an assistant" do
        let(:storyteller) do
          current_user.storytellers << build(:storyteller)
          current_user.storytellers.last
        end
        let(:assistant_thread) { current_user.assistant_threads.create }
        let(:valid_attributes) { {assistant_thread_id: assistant_thread.id, storyteller_id: storyteller.id, content: "Hi there"} }

        it "creates a new Message" do
          # Creates an assistant, thread, run and request and response messages on the OpenAI API.
          VCR.use_cassette("requests_assistant_messages_create_and_run") do
            expect {
              post messages_url, as: :turbo_stream, params: {message: valid_attributes}
            }.to change(assistant_thread.messages, :count).by(2)
          end

          expect(assistant_thread.messages.count).to eq(2)
          response = assistant_thread.messages.last
          expect(response.remote_id).to be_present
          expect(response.run).to be_present
          expect(response.model).to eq(storyteller.model)
          expect(response.prompt_token_usage).to be_present
          expect(response.completion_token_usage).to be_present
        end
      end
    end
  end
end
```

## Use

In your app you should now be able to create a new `Storyteller` and a new `AssistantThread`, go to the `AssistantThread` show page and create and receive messages from the Assistant!

## Support

Any issues, please email me at `hello@alexrudall.com` and I'll respond ASAP.
